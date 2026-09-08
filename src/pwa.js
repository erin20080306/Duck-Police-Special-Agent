// Installation is optional; a blocked or unsupported service worker never blocks the game.
const $ = (id) => document.getElementById(id);
const standalone = () =>
  matchMedia("(display-mode: standalone)").matches ||
  navigator.standalone === true;
const appleMobile =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
let installPrompt = null;
let registration = null;
let offlineReady = false;
let applyingUpdate = false;
let installed = false;

function updateStatus() {
  $("installApp").hidden = installed || standalone();
  $("offlineStatus").textContent = offlineReady
    ? navigator.onLine
      ? "離線戰區已備妥"
      : "離線模式 · 戰區已備妥"
    : navigator.onLine
      ? "正在準備離線戰區…"
      : "尚未備妥離線戰區，請先連線";
}

function showInstall() {
  const steps = appleMobile
    ? [
        "在瀏覽器中點選「分享」按鈕。",
        "選擇「加入主畫面」（或「新增至主畫面」）。",
        "確認「鴨警特工」名稱，點選「新增」。",
      ]
    : [
        "開啟瀏覽器的 ⋮ 或 ⋯ 選單。",
        "選擇「安裝應用程式」或「新增至主畫面」。",
        "從主畫面的鴨警圖示啟動遊戲。",
      ];
  $("installCopy").textContent = installPrompt
    ? "安裝後可從主畫面直接出勤，並以獨立視窗開啟。"
    : appleMobile
      ? "iPhone / iPad 請透過瀏覽器的分享選單加入主畫面。若目前看不到選项，請使用 Safari 開啟本頁。"
      : "若瀏覽器尚未提供安裝提示，可從瀏覽器選單手動加入。";
  $("installSteps").replaceChildren(
    ...steps.map((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      return li;
    }),
  );
  $("installSteps").hidden = !!installPrompt;
  $("confirmInstall").hidden = !installPrompt;
  $("installDialog").showModal();
}

$("installApp").addEventListener("click", showInstall);
$("closeInstall").addEventListener("click", () => $("installDialog").close());
$("installDialog").addEventListener("click", (event) => {
  if (event.target !== $("installDialog")) return;
  const rect = $("installDialog").getBoundingClientRect();
  if (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  )
    $("installDialog").close();
});
addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  updateStatus();
});
$("confirmInstall").addEventListener("click", async () => {
  const prompt = installPrompt;
  if (!prompt) return;
  installPrompt = null;
  $("confirmInstall").disabled = true;
  try {
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") $("installDialog").close();
    else showInstall();
  } catch {
    showInstall();
  } finally {
    $("confirmInstall").disabled = false;
  }
});
addEventListener("appinstalled", () => {
  installed = true;
  installPrompt = null;
  $("installApp").hidden = true;
  $("installDialog").close();
});
addEventListener("online", () => {
  updateStatus();
  registration?.update().catch(() => {});
});
addEventListener("offline", updateStatus);
matchMedia("(display-mode: standalone)").addEventListener(
  "change",
  updateStatus,
);

function offerUpdate() {
  $("updateApp").hidden = !registration?.waiting;
}
$("updateApp").addEventListener("click", () => {
  if (!registration?.waiting) return;
  applyingUpdate = true;
  $("updateApp").disabled = true;
  $("updateApp").textContent = "正在套用更新…";
  registration.waiting.postMessage({ type: "SKIP_WAITING" });
});

async function prepareOffline() {
  updateStatus();
  if (!("serviceWorker" in navigator) || !window.isSecureContext) {
    $("offlineStatus").textContent =
      "此瀏覽器可線上遊玩；安裝與離線功能需要 HTTPS";
    return;
  }
  // Vite development uses changing module URLs. Register only the built game.
  if (!import.meta.env.PROD) {
    $("offlineStatus").textContent = "開發預覽 · 正式版支援離線安裝";
    return;
  }
  try {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (applyingUpdate) location.reload();
      else offerUpdate();
    });
    registration = await navigator.serviceWorker.register(
      `${import.meta.env.BASE_URL}sw.js`,
      { updateViaCache: "none" },
    );
    offerUpdate();
    const watchInstall = () => {
      const installing = registration.installing;
      installing?.addEventListener("statechange", () => {
        if (installing.state === "installed") offerUpdate();
        if (installing.state === "redundant" && !offlineReady)
          $("offlineStatus").textContent = "離線下載未完成 · 可繼續線上遊玩";
      });
    };
    watchInstall();
    registration.addEventListener("updatefound", watchInstall);
    // Activation follows a successful, atomic precache of the complete build.
    await navigator.serviceWorker.ready;
    offlineReady = true;
    offerUpdate();
    updateStatus();
  } catch (error) {
    console.warn("Offline preparation unavailable", error);
    $("offlineStatus").textContent = "離線下載未完成 · 可繼續線上遊玩";
  }
}
prepareOffline();
