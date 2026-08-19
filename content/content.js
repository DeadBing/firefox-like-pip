import { DEFAULT_SETTINGS, loadSettings, mergeSettings } from "../lib/settings.js";
import {
  collectVideos,
  pickBestVideo,
  shouldShowPictureInPictureToggle,
  scoreVideo,
} from "../lib/video-utils.js";
import { isToggleShortcut } from "../lib/keys.js";
import { PipPlayer } from "../pip/player.js";

const TOGGLE_ID = "pip-addon-toggle";
const PLACEHOLDER_ID = "pip-addon-placeholder";
const SAMPLE_MS = 80;

let settings = { ...DEFAULT_SETTINGS };
loadSettings().then((next) => {
  settings = next;
});
let player = null;
let activeVideo = null;
let hoveredVideo = null;
let lastMouse = { x: 0, y: 0, present: false };
let sampleTimer = 0;
let autoOpened = false;

const videos = new Set();
const videoIds = new WeakMap();
let videoSeq = 0;
let mutationTimer = 0;

function viewport() {
  return { width: window.innerWidth, height: window.innerHeight };
}

function allVideos() {
  const next = collectVideos(document, []);
  videos.clear();
  for (const video of next) {
    if (!videoIds.has(video)) {
      videoIds.set(video, `pip-${++videoSeq}`);
    }
    videos.add(video);
  }
  return [...videos];
}

function eligibleVideos() {
  return allVideos().filter((video) =>
    shouldShowPictureInPictureToggle(video, settings, {
      videoWidth: video.clientWidth,
      videoHeight: video.clientHeight,
    })
  );
}

function videoFromPoint(x, y) {
  const stack = document.elementsFromPoint(x, y);
  for (const node of stack) {
    if (node.id === TOGGLE_ID || node.id === `${TOGGLE_ID}-host`) {
      return hoveredVideo;
    }
    if (node.tagName === "VIDEO") {
      return node;
    }
  }
  let match = null;
  let matchArea = 0;
  for (const video of allVideos()) {
    const rect = video.getBoundingClientRect();
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      const area = rect.width * rect.height;
      if (area > matchArea) {
        match = video;
        matchArea = area;
      }
    }
  }
  return match;
}

function ensureToggle() {
  let host = document.getElementById(`${TOGGLE_ID}-host`);
  if (host) {
    return host;
  }
  host = document.createElement("div");
  host.id = `${TOGGLE_ID}-host`;
  host.setAttribute("data-pip-addon", "toggle");
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    #wrap {
      position: fixed;
      z-index: 2147483646;
      pointer-events: none;
    }
    button {
      pointer-events: auto;
      display: flex;
      align-items: center;
      gap: 8px;
      height: 32px;
      padding: 0 10px;
      border: 0;
      border-radius: 4px;
      background: rgb(12 12 13 / 80%);
      color: #fff;
      font: 12px/1 system-ui, sans-serif;
      cursor: pointer;
      opacity: 0;
      transform: translateY(-4px);
      transition: opacity 160ms ease, transform 160ms ease, background 160ms ease;
    }
    #wrap.visible button { opacity: 1; transform: none; }
    button:hover { background: rgb(12 12 13 / 95%); }
    svg { width: 16px; height: 16px; fill: #fff; }
  `;
  const wrap = document.createElement("div");
  wrap.id = "wrap";
  const button = document.createElement("button");
  button.id = TOGGLE_ID;
  button.type = "button";
  button.setAttribute(
    "aria-label",
    chrome.i18n?.getMessage("toggleLabel") || "Watch in Picture-in-Picture"
  );
  button.innerHTML = `
    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v9a1.5 1.5 0 0 1-1.5 1.5H8V12h4.5v-9h-9V7H2z"/><path d="M2 8.5A1.5 1.5 0 0 1 3.5 7H8a1.5 1.5 0 0 1 1.5 1.5v4A1.5 1.5 0 0 1 8 14H3.5A1.5 1.5 0 0 1 2 12.5z"/></svg>
    <span>${chrome.i18n?.getMessage("toggleShort") || "Picture-in-Picture"}</span>
  `;
  const stop = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  for (const type of ["pointerdown", "mousedown", "mouseup", "auxclick"]) {
    button.addEventListener(type, stop, true);
  }
  button.addEventListener(
    "click",
    (event) => {
      stop(event);
      if (hoveredVideo) {
        toggleVideo(hoveredVideo);
      }
    },
    true
  );
  wrap.append(button);
  shadow.append(style, wrap);
  document.documentElement.append(host);
  host._wrap = wrap;
  host._shadow = shadow;
  return host;
}

function positionToggle(video) {
  const host = ensureToggle();
  const wrap = host._wrap;
  if (!video || !settings.toggleEnabled) {
    wrap.classList.remove("visible");
    return;
  }
  const eligible = shouldShowPictureInPictureToggle(video, settings, {
    videoWidth: video.clientWidth,
    videoHeight: video.clientHeight,
  });
  if (!eligible) {
    wrap.classList.remove("visible");
    return;
  }
  const rect = video.getBoundingClientRect();
  wrap.style.top = `${Math.max(8, rect.top + 10)}px`;
  wrap.style.left = `${Math.max(8, rect.right - 170)}px`;
  wrap.classList.add("visible");
}

function sampleMouse() {
  if (!lastMouse.present || !settings.toggleEnabled) {
    ensureToggle()._wrap.classList.remove("visible");
    return;
  }
  hoveredVideo = videoFromPoint(lastMouse.x, lastMouse.y);
  positionToggle(hoveredVideo);
}

function startSampling() {
  if (sampleTimer) {
    return;
  }
  sampleTimer = window.setInterval(sampleMouse, SAMPLE_MS);
}

function stopSampling() {
  window.clearInterval(sampleTimer);
  sampleTimer = 0;
}

function showPlaceholder(video) {
  hidePlaceholder();
  if (!settings.showPlaceholder) {
    return;
  }
  const host = document.createElement("div");
  host.id = PLACEHOLDER_ID;
  host.style.cssText = "position:fixed;z-index:2147483645;pointer-events:none;";
  const shadow = host.attachShadow({ mode: "closed" });
  const box = document.createElement("div");
  box.style.cssText = `
    display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;
    background:#0c0c0d;color:#fff;font:14px/1.4 system-ui,sans-serif;text-align:center;padding:16px;
  `;
  box.innerHTML = `<div>${
    chrome.i18n?.getMessage("placeholderText") || "This video is playing in Picture-in-Picture"
  }</div>`;
  const button = document.createElement("button");
  button.textContent = chrome.i18n?.getMessage("placeholderReturn") || "Return this tab";
  button.style.cssText =
    "pointer-events:auto;background:#0060df;color:#fff;border:0;border-radius:4px;padding:8px 12px;cursor:pointer;";
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    player?.close({ pause: false, reason: "placeholder" });
  });
  box.append(button);
  shadow.append(box);
  document.documentElement.append(host);
  const place = () => {
    const rect = video.getBoundingClientRect();
    host.style.top = `${rect.top}px`;
    host.style.left = `${rect.left}px`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;
  };
  place();
  host._place = place;
}

function hidePlaceholder() {
  document.getElementById(PLACEHOLDER_ID)?.remove();
}

function attachPlayer(nextPlayer, video) {
  player = nextPlayer;
  activeVideo = video;
  showPlaceholder(video);
}

async function toggleVideo(video) {
  if (!video) {
    return { ok: false, reason: "no-video" };
  }
  if (player && activeVideo === video) {
    player.close({ pause: settings.pauseOnClose, reason: "toggle" });
    return { ok: true, closed: true };
  }
  if (settings.respectDisablePictureInPicture && video.disablePictureInPicture) {
    return { ok: false, reason: "disabled" };
  }
  if (player && player.stillOpen()) {
    try {
      await player.replaceSource(video);
      if (!player?.stillOpen()) {
        return { ok: false, reason: "aborted" };
      }
      attachPlayer(player, video);
      return { ok: true, replaced: true };
    } catch (error) {
      player.close({ pause: false, reason: "replace-failed" });
      return { ok: false, reason: String(error?.message || error) };
    }
  }
  try {
    const next = new PipPlayer({
      sourceVideo: video,
      settings,
      openerWindow: window,
      onClose: (closed) => {
        if (player === next) {
          player = null;
          activeVideo = null;
          autoOpened = false;
          hidePlaceholder();
        }
        return closed;
      },
    });
    player = next;
    const opened = await next.open();
    if (opened?.mode === "aborted" || !next.stillOpen()) {
      if (player === next) {
        player = null;
        activeVideo = null;
      }
      return { ok: false, reason: "aborted" };
    }
    attachPlayer(next, video);
    return { ok: true, mode: opened?.mode };
  } catch (error) {
    if (player && !player.stillOpen()) {
      player = null;
      activeVideo = null;
    }
    return { ok: false, reason: String(error?.message || error) };
  }
}

function toggleBest() {
  const video = pickBestVideo(allVideos(), viewport());
  if (!video) {
    return Promise.resolve({ ok: false, reason: "no-video" });
  }
  const score = scoreVideo(video, viewport());
  if (window !== window.top && score < 1_000_000) {
    return Promise.resolve({ ok: false, reason: "not-preferred" });
  }
  return toggleVideo(video);
}

function getBestVideoScore() {
  const video = pickBestVideo(allVideos(), viewport());
  if (!video) {
    return null;
  }
  return { score: scoreVideo(video, viewport()) };
}

function registerAutoPip() {
  try {
    navigator.mediaSession.setActionHandler("enterpictureinpicture", async () => {
      if (!settings.autoPipOnTabSwitch || player) {
        return;
      }
      const video = pickBestVideo(
        allVideos().filter((item) => !item.paused && !item.ended),
        viewport()
      );
      if (!video) {
        return;
      }
      const result = await toggleVideo(video);
      autoOpened = Boolean(result?.ok && !result.closed);
    });
  } catch {
    /* Media Session action not supported */
  }
}

function maybeCloseAutoPip() {
  if (autoOpened && player && !document.hidden) {
    player.close({ pause: false, reason: "foregrounded" });
  }
}

document.addEventListener(
  "mousemove",
  (event) => {
    lastMouse = { x: event.clientX, y: event.clientY, present: true };
    startSampling();
  },
  { passive: true }
);

document.addEventListener("mouseout", (event) => {
  if (!event.relatedTarget) {
    lastMouse.present = false;
  }
});

document.addEventListener(
  "keydown",
  (event) => {
    if (!isToggleShortcut(event, navigator.platform)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    toggleBest();
  },
  true
);

document.addEventListener("visibilitychange", maybeCloseAutoPip);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync" || !changes.pipAddonSettings) {
    return;
  }
  settings = mergeSettings(changes.pipAddonSettings.newValue);
  registerAutoPip();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "QUERY_VIDEOS") {
    sendResponse(getBestVideoScore());
    return;
  }
  if (message?.type === "TOGGLE_PIP") {
    toggleBest().then(sendResponse);
    return true;
  }
  if (message?.type === "OPEN_PIP") {
    const video =
      allVideos().find((item) => videoIds.get(item) === message.videoId) ||
      pickBestVideo(allVideos(), viewport());
    toggleVideo(video).then(sendResponse);
    return true;
  }
  if (message?.type === "CLOSE_PIP") {
    player?.close({ pause: message.pause !== false, reason: "message" });
    sendResponse({ ok: true });
  }
});

const observer = new MutationObserver(() => {
  window.clearTimeout(mutationTimer);
  mutationTimer = window.setTimeout(() => {
    allVideos();
    document.getElementById(PLACEHOLDER_ID)?._place?.();
  }, 120);
});
observer.observe(document.documentElement, { childList: true, subtree: true });

registerAutoPip();
allVideos();

globalThis.PipAddonContent = {
  toggleBest,
  toggleVideo,
  getBestVideoScore,
  eligibleVideos,
};
