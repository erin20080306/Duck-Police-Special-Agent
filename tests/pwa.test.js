import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import { offlineGame, serviceWorkerSource } from "../build/pwa.js";

function worker({
  version = "v2",
  files = ["index.html", "assets/game.js", "assets/concrete.webp"],
  existing = {},
  failFile = null,
  scope = "/",
  varyOrigin = false,
} = {}) {
  const origin = "https://game.example";
  const listeners = {};
  const stores = new Map(
    Object.entries(existing).map(([name, entries]) => [
      name,
      new Map(Object.entries(entries)),
    ]),
  );
  const cachedOrigins = new Map();
  let network = true,
    skipped = 0,
    claimed = 0;
  const requests = [];
  const urlOf = (request) =>
    typeof request === "string" ? request : request.url;
  const caches = {
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      return {
        async addAll(requests) {
          const staged = [];
          for (const request of requests) {
            if (request.url.endsWith(failFile || "__never__"))
              throw new Error("network unavailable");
            assert.equal(request.cache, "reload");
            staged.push([
              request.url,
              "cached:" + request.url,
              request.headers.get("Origin"),
            ]);
          }
          for (const [url, body, origin] of staged) {
            stores.get(name).set(url, body);
            cachedOrigins.set(name + ":" + url, origin);
          }
        },
        async match(request, options = {}) {
          const url = urlOf(request);
          const body = stores.get(name).get(url);
          const origin = request.headers?.get("Origin") ?? null;
          if (
            varyOrigin &&
            !options.ignoreVary &&
            origin !== (cachedOrigins.get(name + ":" + url) ?? null)
          )
            return undefined;
          return body
            ? new Response(body, {
                headers: varyOrigin ? { Vary: "Origin" } : {},
              })
            : undefined;
        },
      };
    },
  };
  vm.runInNewContext(serviceWorkerSource(files, version), {
    URL,
    Request,
    caches,
    self: {
      location: { href: origin + scope + "sw.js" },
      addEventListener: (name, handler) => {
        listeners[name] = handler;
      },
      skipWaiting: () => {
        skipped++;
      },
      clients: {
        claim: async () => {
          claimed++;
        },
      },
    },
    fetch: async (request) => {
      requests.push(urlOf(request));
      if (!network) throw new Error("offline");
      return new Response("network:" + urlOf(request));
    },
  });
  async function dispatch(name, properties = {}) {
    let pending;
    listeners[name]({
      ...properties,
      waitUntil: (p) => {
        pending = p;
      },
      respondWith: (p) => {
        pending = p;
      },
    });
    return pending;
  }
  return {
    stores,
    requests,
    dispatch,
    offline: () => {
      network = false;
    },
    skipped: () => skipped,
    claimed: () => claimed,
  };
}

test("offline shell, JS and material remain available after a complete precache", async () => {
  const sw = worker();
  await sw.dispatch("install");
  await sw.dispatch("activate");
  sw.offline();
  for (const [path, mode] of [
    ["/?source=installed", "navigate"],
    ["/assets/game.js", "cors"],
    ["/assets/concrete.webp", "cors"],
  ]) {
    const response = await sw.dispatch("fetch", {
      request: { url: "https://game.example" + path, mode, method: "GET" },
    });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /^cached:/);
  }
  assert.equal(sw.requests.length, 0);
  assert.equal(sw.claimed(), 1);
  assert.equal(
    sw.skipped(),
    0,
    "an update must not interrupt gameplay automatically",
  );
  await sw.dispatch("message", { data: { type: "SKIP_WAITING" } });
  assert.equal(sw.skipped(), 1);
});

test("a missing build asset prevents installing an incomplete offline game", async () => {
  const sw = worker({ failFile: "concrete.webp" });
  await assert.rejects(sw.dispatch("install"), /network unavailable/);
  assert.equal(sw.claimed(), 0);
  assert.equal([...sw.stores.values()][0].size, 0);
});

test("Vary: Origin on static files cannot make crossorigin CSS and modules miss offline precache", async () => {
  const sw = worker({
    varyOrigin: true,
    files: ["index.html", "assets/game.js", "assets/game.css"],
  });
  await sw.dispatch("install");
  sw.offline();
  for (const path of ["assets/game.js", "assets/game.css"]) {
    const request = new Request("https://game.example/" + path, {
      mode: "cors",
      headers: { Origin: "https://game.example" },
    });
    const response = await sw.dispatch("fetch", { request });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /^cached:/);
  }
  assert.equal(sw.requests.length, 0);
});

test("updates retain previous assets and never delete another app or scope cache", async () => {
  const sw = worker({
    existing: {
      "another-app": { "/unrelated": "keep" },
      "duck-force-%2Fother%2F-v0": { "/other": "keep" },
      "duck-force-%2F-v0": { "/obsolete": "remove" },
      "duck-force-%2F-v1": {
        "https://game.example/assets/previous.js": "previous build",
      },
    },
  });
  await sw.dispatch("install");
  await sw.dispatch("activate");
  assert.ok(sw.stores.has("another-app"));
  assert.ok(sw.stores.has("duck-force-%2Fother%2F-v0"));
  assert.ok(!sw.stores.has("duck-force-%2F-v0"));
  sw.offline();
  const response = await sw.dispatch("fetch", {
    request: {
      url: "https://game.example/assets/previous.js",
      method: "GET",
      mode: "cors",
    },
  });
  assert.equal(await response.text(), "previous build");
});

test("service worker stays within its scope and does not intercept writes", async () => {
  const sw = worker({ scope: "/game/" });
  await sw.dispatch("install");
  for (const request of [
    { url: "https://other.example/game/icon.png", method: "GET" },
    { url: "https://game.example/other/page", method: "GET" },
    { url: "https://game.example/game/save", method: "POST" },
  ])
    assert.equal(await sw.dispatch("fetch", { request }), undefined);
  sw.offline();
  const response = await sw.dispatch("fetch", {
    request: {
      url: "https://game.example/game/",
      method: "GET",
      mode: "navigate",
    },
  });
  assert.equal(
    await response.text(),
    "cached:https://game.example/game/index.html",
  );
});

test("build plugin includes public and hashed assets, and changes cache version when content changes", async () => {
  const root = await mkdtemp(join(tmpdir(), "duck-pwa-"));
  try {
    const dist = join(root, "dist");
    await mkdir(join(dist, "assets"), { recursive: true });
    await writeFile(join(dist, "index.html"), "<main>game</main>");
    await writeFile(join(dist, "assets", "game-a1b2.js"), "game code");
    await writeFile(join(dist, "assets", "concrete.webp"), "texture");
    const plugin = offlineGame();
    plugin.configResolved({ root, build: { outDir: "dist" } });
    await plugin.closeBundle();
    const first = await readFile(join(dist, "sw.js"), "utf8");
    for (const path of [
      "index.html",
      "assets/game-a1b2.js",
      "assets/concrete.webp",
    ])
      assert.ok(first.includes('"' + path + '"'));
    assert.ok(!first.includes('"sw.js"'));
    await plugin.closeBundle();
    assert.equal(
      await readFile(join(dist, "sw.js"), "utf8"),
      first,
      "identical output has stable cache version",
    );
    await writeFile(join(dist, "assets", "concrete.webp"), "updated texture");
    await plugin.closeBundle();
    assert.notEqual(await readFile(join(dist, "sw.js"), "utf8"), first);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("manifest has installable standalone metadata and correctly sized PNG icons", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../public/manifest.webmanifest", import.meta.url)),
  );
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.orientation, "any");
  assert.equal(manifest.start_url, "./");
  assert.ok(manifest.icons.some((icon) => icon.purpose === "maskable"));
  for (const icon of manifest.icons) {
    const bytes = await readFile(
      new URL("../public/" + icon.src, import.meta.url),
    );
    assert.equal(bytes.subarray(1, 4).toString(), "PNG");
    assert.equal(
      `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`,
      icon.sizes,
    );
  }
});

async function installationPage({
  apple = false,
  installed = false,
  production = false,
  serviceWorker,
} = {}) {
  function target() {
    const listeners = new Map();
    return {
      hidden: false,
      disabled: false,
      textContent: "",
      open: false,
      children: [],
      addEventListener(name, callback) {
        if (!listeners.has(name)) listeners.set(name, []);
        listeners.get(name).push(callback);
      },
      async emit(name, event = {}) {
        for (const callback of listeners.get(name) || []) await callback(event);
      },
      showModal() {
        this.open = true;
      },
      close() {
        this.open = false;
      },
      replaceChildren(...children) {
        this.children = children;
      },
    };
  }
  const events = target(),
    elements = new Map(),
    display = target();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, target());
    return elements.get(id);
  };
  const navigator = {
    userAgent: apple ? "iPhone" : "Android Chrome",
    platform: apple ? "iPhone" : "Linux",
    maxTouchPoints: 5,
    onLine: true,
    standalone: installed,
  };
  if (serviceWorker) navigator.serviceWorker = serviceWorker;
  let reloads = 0;
  const source = (
    await readFile(new URL("../src/pwa.js", import.meta.url), "utf8")
  )
    .replaceAll("import.meta.env.PROD", String(production))
    .replaceAll("import.meta.env.BASE_URL", '"/"');
  vm.runInNewContext(source, {
    document: { getElementById: element, createElement: target },
    navigator,
    matchMedia: () => ({ ...display, matches: installed }),
    addEventListener: events.addEventListener.bind(events),
    window: { isSecureContext: true },
    location: {
      reload: () => {
        reloads++;
      },
    },
    console,
  });
  if (serviceWorker) await new Promise((resolve) => setImmediate(resolve));
  return { element, events, navigator, reloads: () => reloads };
}

test("iPhone installation gives actionable sharing steps without a false native install button", async () => {
  const page = await installationPage({ apple: true });
  await page.element("installApp").emit("click");
  assert.equal(page.element("installDialog").open, true);
  assert.match(page.element("installCopy").textContent, /iPhone/);
  assert.match(
    page
      .element("installSteps")
      .children.map((li) => li.textContent)
      .join(" "),
    /分享.*主畫面/,
  );
  assert.equal(page.element("confirmInstall").hidden, true);
  await page.element("closeInstall").emit("click");
  assert.equal(page.element("installDialog").open, false);
});

test("Android prompt is used once, and a declined prompt leaves manual installation usable", async () => {
  const page = await installationPage();
  let prompts = 0,
    prevented = false;
  await page.events.emit("beforeinstallprompt", {
    preventDefault: () => {
      prevented = true;
    },
    prompt: async () => {
      prompts++;
    },
    userChoice: Promise.resolve({ outcome: "dismissed" }),
  });
  assert.equal(prevented, true);
  await page.element("installApp").emit("click");
  assert.equal(page.element("confirmInstall").hidden, false);
  await page.element("confirmInstall").emit("click");
  assert.equal(prompts, 1);
  assert.equal(page.element("confirmInstall").hidden, true);
  assert.equal(page.element("confirmInstall").disabled, false);
  assert.equal(page.element("installSteps").hidden, false);
  assert.equal(page.element("installDialog").open, true);
  await page.element("confirmInstall").emit("click");
  assert.equal(prompts, 1);
});

test("installed applications hide installation entry even when network state changes", async () => {
  const standalone = await installationPage({ installed: true });
  assert.equal(standalone.element("installApp").hidden, true);
  const page = await installationPage();
  await page.events.emit("appinstalled");
  page.navigator.onLine = false;
  await page.events.emit("offline");
  assert.equal(page.element("installApp").hidden, true);
});

test("first install clears a transient update button when activation finishes", async () => {
  let finishActivation, stateChange, controllerChange;
  const installing = {
    state: "installing",
    addEventListener: (name, listener) => {
      if (name === "statechange") stateChange = listener;
    },
  };
  const registration = { installing, waiting: null, addEventListener() {} };
  const serviceWorker = {
    register: async () => registration,
    ready: new Promise((resolve) => {
      finishActivation = resolve;
    }),
    addEventListener: (name, listener) => {
      if (name === "controllerchange") controllerChange = listener;
    },
  };
  const page = await installationPage({ production: true, serviceWorker });
  // Browsers may expose waiting briefly on first install before auto-activation.
  registration.waiting = {};
  installing.state = "installed";
  stateChange();
  assert.equal(page.element("updateApp").hidden, false);
  registration.waiting = null;
  installing.state = "activated";
  finishActivation(registration);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(page.element("offlineStatus").textContent, "離線戰區已備妥");
  assert.equal(page.element("updateApp").hidden, true);
  assert.equal(page.reloads(), 0);

  // A later update activated by another tab must also clear this tab's button.
  registration.waiting = {};
  installing.state = "installed";
  stateChange();
  assert.equal(page.element("updateApp").hidden, false);
  registration.waiting = null;
  controllerChange();
  assert.equal(page.element("updateApp").hidden, true);
  assert.equal(
    page.reloads(),
    0,
    "a controller change alone must not interrupt gameplay",
  );
});
