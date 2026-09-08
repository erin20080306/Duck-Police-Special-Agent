import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve, relative, sep } from "node:path";

export function serviceWorkerSource(files, version) {
  return `/* Generated from the complete production build. Do not edit dist/sw.js. */
const ROOT = new URL('./', self.location.href);
const PREFIX = 'duck-force-' + encodeURIComponent(ROOT.pathname) + '-';
const CACHE = PREFIX + ${JSON.stringify(version)};
const FILES = ${JSON.stringify(files)}.map(path => new URL(path, ROOT).href);
const SHELL = new URL('index.html', ROOT).href;
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES.map(url => new Request(url, { cache: 'reload' })))));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = (await caches.keys()).filter(key => key.startsWith(PREFIX) && key !== CACHE);
    // Keep the previous build for assets requested by another open game tab.
    await Promise.all(keys.slice(0, -1).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== ROOT.origin || !url.pathname.startsWith(ROOT.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Serve one coherent build until the player accepts the available update.
    if (request.mode === 'navigate') return (await cache.match(SHELL, { ignoreVary: true })) || fetch(request);
    // These caches contain only fixed build files. Hosts may add Vary: Origin,
    // while crossorigin module/style requests carry different Origin headers
    // from installation fetches; their static bytes are nevertheless identical.
    const cached = await cache.match(request, { ignoreVary: true });
    if (cached) return cached;
    for (const key of (await caches.keys()).filter(key => key.startsWith(PREFIX) && key !== CACHE)) {
      const previous = await (await caches.open(key)).match(request, { ignoreVary: true });
      if (previous) return previous;
    }
    return fetch(request);
  })());
});
`;
}

export function offlineGame() {
  let outputDirectory;
  return {
    name: "duck-force-offline",
    apply: "build",
    configResolved(config) {
      outputDirectory = resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      const files = [];
      async function collect(directory) {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          const path = resolve(directory, entry.name);
          if (entry.isDirectory()) await collect(path);
          else if (entry.name !== "sw.js" && !entry.name.endsWith(".map"))
            files.push(relative(outputDirectory, path).split(sep).join("/"));
        }
      }
      await collect(outputDirectory);
      files.sort();
      const hash = createHash("sha256");
      for (const file of files)
        hash
          .update(file)
          .update(await readFile(resolve(outputDirectory, file)));
      await writeFile(
        resolve(outputDirectory, "sw.js"),
        serviceWorkerSource(files, hash.digest("hex").slice(0, 16)),
      );
    },
  };
}
