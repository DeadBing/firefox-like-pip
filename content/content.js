import { DEFAULT_SETTINGS, loadSettings, mergeSettings } from "../lib/settings.js";
import {
  collectVideos,
  pickBestVideo,
  pipRequestOptions,
  shouldShowPictureInPictureToggle,
  scoreVideo,
} from "../lib/video-utils.js";
import {
  preserveVideoQuality,
  RemoteVideo,
  snapshotVideo,
} from "../lib/remote-video.js";
import { isToggleShortcut } from "../lib/keys.js";
import { adoptIncomingTrack, captureVideoStream, shouldUseNativeVideoPip } from "../lib/media-stream.js";
import {
  RTC_CONFIG,
  applyIceCandidate,
  createIceBucket,
  createReceiverAnswer,
  flushIceBucket,
  iceCandidatePayload,
  paintPipShell,
  shouldCloseOnIceFailure,
} from "../lib/remote-bridge.js";
import { PipPlayer } from "../pip/player.js";

const TOGGLE_ID = "pip-addon-toggle";
const PLACEHOLDER_ID = "pip-addon-placeholder";
const SAMPLE_MS = 80;

function isDocumentPipWindow() {
  if (window.matchMedia("(display-mode: picture-in-picture)").matches) {
    return true;
  }
  try {
    return window.opener?.documentPictureInPicture?.window === window;
  } catch {
    return false;
  }
}

const IS_DOCUMENT_PIP = isDocumentPipWindow();

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
let remoteSource = null;
let remoteReceiver = null;
const iceBucket = createIceBucket();

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
  if (IS_DOCUMENT_PIP || sampleTimer) {
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

function waitForIceGathering(connection, timeoutMs = 1500) {
  if (connection.iceGatheringState === "complete") {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const done = () => {
      if (connection.iceGatheringState !== "complete") {
        return;
      }
      window.clearTimeout(timer);
      connection.removeEventListener("icegatheringstatechange", done);
      resolve();
    };
    const timer = window.setTimeout(() => {
      connection.removeEventListener("icegatheringstatechange", done);
      resolve();
    }, timeoutMs);
    connection.addEventListener("icegatheringstatechange", done);
  });
}

function relayRemote(targetFrameId, event, sessionId, payload) {
  return chrome.runtime
    .sendMessage({
      type: "PIP_REMOTE_RELAY",
      targetFrameId,
      event,
      sessionId,
      payload,
    })
    .catch(() => null);
}

function listenForIce(connection, targetFrameId, sessionId) {
  connection.addEventListener("icecandidate", (event) => {
    relayRemote(targetFrameId, "ice", sessionId, iceCandidatePayload(event.candidate));
  });
}

function handleRemoteIce(sessionId, connection, candidate) {
  if (connection) {
    applyIceCandidate(connection, candidate);
    return;
  }
  iceBucket.queue(sessionId, candidate);
}

function cleanupRemoteSource({ pause = false, notify = true } = {}) {
  const session = remoteSource;
  if (!session) {
    return;
  }
  remoteSource = null;
  window.clearInterval(session.stateTimer);
  session.connection.close();
  for (const track of session.stream.getTracks()) {
    track.stop();
  }
  if (pause) {
    session.video.pause();
  }
  if (notify) {
    relayRemote(0, "close", session.sessionId);
  }
  if (player === session.controller) {
    player = null;
    activeVideo = null;
    autoOpened = false;
    hidePlaceholder();
  }
}

function applyRemoteCommand(video, command) {
  if (!video || !command) {
    return;
  }
  switch (command.name) {
    case "play":
      video.play()?.catch(() => {});
      break;
    case "pause":
      video.pause();
      break;
    case "currentTime":
      video.currentTime = Number(command.value) || 0;
      break;
    case "volume":
      video.volume = Number(command.value);
      break;
    case "muted":
      video.muted = Boolean(command.value);
      break;
    case "playbackRate":
      video.playbackRate = Number(command.value) || 1;
      break;
  }
}

async function openRemoteSource(video) {
  video.play()?.catch(() => {});
  const { stream } = captureVideoStream(video);
  const tracks = stream.getVideoTracks();
  if (!tracks.length) {
    for (const track of stream.getTracks()) {
      track.stop();
    }
    throw new Error("The captured video stream has no video track");
  }

  const sessionId = crypto.randomUUID();
  const connection = new RTCPeerConnection(RTC_CONFIG);
  listenForIce(connection, 0, sessionId);
  const controller = {
    stillOpen: () => remoteSource?.sessionId === sessionId,
    close: ({ pause = false } = {}) => cleanupRemoteSource({ pause }),
  };
  remoteSource = { sessionId, video, stream, connection, controller, stateTimer: 0 };
  await flushIceBucket(iceBucket, sessionId, connection);

  for (const track of tracks) {
    const sender = connection.addTrack(track, stream);
    await preserveVideoQuality(track, sender).catch(() => {});
  }

  try {
    await connection.setLocalDescription(await connection.createOffer());
    await waitForIceGathering(connection);
    const response = await chrome.runtime.sendMessage({
      type: "PIP_REMOTE_OPEN",
      sessionId,
      offer: connection.localDescription.toJSON(),
      state: snapshotVideo(video, document.title),
    });
    if (!response?.ok || !response.answer) {
      throw new Error(response?.reason || "The top frame could not open Document PiP");
    }
    await connection.setRemoteDescription(response.answer);
    await flushIceBucket(iceBucket, sessionId, connection);

    const sendState = () =>
      relayRemote(0, "state", sessionId, snapshotVideo(video, document.title));
    remoteSource.stateTimer = window.setInterval(sendState, 250);
    let iceState = connection.connectionState;
    connection.addEventListener("connectionstatechange", () => {
      const next = connection.connectionState;
      const previous = iceState;
      iceState = next;
      if (shouldCloseOnIceFailure(previous, next)) {
        cleanupRemoteSource();
      }
    });
    player = controller;
    activeVideo = video;
    showPlaceholder(video);
    sendState();
    return { ok: true, mode: "document" };
  } catch (error) {
    relayRemote(0, "close", sessionId);
    connection.close();
    for (const track of stream.getTracks()) {
      track.stop();
    }
    if (remoteSource?.sessionId === sessionId) {
      remoteSource = null;
    }
    throw error;
  }
}

async function openRemoteReceiver(message) {
  if (window !== window.top || IS_DOCUMENT_PIP || !("documentPictureInPicture" in window)) {
    return { ok: false, reason: "Document PiP is unavailable in the top frame" };
  }
  if (remoteReceiver) {
    remoteReceiver.player.close({ pause: false, reason: "replace-remote" });
  } else if (player) {
    player.close({ pause: false, reason: "replace-remote" });
  }

  let pipWindow = null;
  let connection = null;
  let next = null;
  try {
    pipWindow = await window.documentPictureInPicture.requestWindow(pipRequestOptions(message.state));
    paintPipShell(pipWindow);
    connection = new RTCPeerConnection(RTC_CONFIG);
    listenForIce(connection, message.sourceFrameId, message.sessionId);
    const stream = new MediaStream();
    const proxy = new RemoteVideo(stream, message.state, (command) =>
      relayRemote(message.sourceFrameId, "control", message.sessionId, command)
    );
    let session = null;
    let iceState = connection.connectionState;
    next = new PipPlayer({
      sourceVideo: proxy,
      settings,
      openerWindow: window,
      onClose: ({ pause } = {}) => {
        if (remoteReceiver === session) {
          remoteReceiver = null;
          connection.close();
          relayRemote(message.sourceFrameId, "closed", message.sessionId, { pause });
        }
        if (player === next) {
          player = null;
          activeVideo = null;
          autoOpened = false;
        }
      },
    });
    connection.addEventListener("track", (event) => {
      const incoming = event.streams?.[0];
      if (incoming) {
        proxy.stream = incoming;
        next.replaceStream(incoming);
        return;
      }
      adoptIncomingTrack(stream, event);
      next.replaceStream(stream);
    });
    /* Answer before waiting for ontrack — otherwise Chrome never delivers the track. */
    await createReceiverAnswer(connection, message.offer);
    session = {
      sessionId: message.sessionId,
      sourceFrameId: message.sourceFrameId,
      connection,
      proxy,
      player: next,
    };
    remoteReceiver = session;
    player = next;
    activeVideo = proxy;
    await flushIceBucket(iceBucket, message.sessionId, connection);
    connection.addEventListener("connectionstatechange", () => {
      const previous = iceState;
      iceState = connection.connectionState;
      if (shouldCloseOnIceFailure(previous, iceState) && remoteReceiver === session) {
        next.close({ pause: false, reason: "remote-failed" });
      }
    });
    const opening = next.open();
    /* Include host/STUN candidates in the answer; still do not wait for ontrack. */
    await waitForIceGathering(connection, 1200);
    await opening;
    return { ok: true, answer: connection.localDescription.toJSON() };
  } catch (error) {
    connection?.close();
    if (next?.stillOpen?.()) {
      next.close({ pause: false, reason: "remote-open-failed" });
    } else if (pipWindow && !pipWindow.closed) {
      pipWindow.close();
    }
    remoteReceiver = null;
    return { ok: false, reason: String(error?.message || error) };
  }
}

function attachPlayer(nextPlayer, video) {
  player = nextPlayer;
  activeVideo = video;
  showPlaceholder(video);
}

async function launchPlayer(video, { nativeOnly = false } = {}) {
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
  try {
    const opened = nativeOnly ? await next.openNative() : await next.open();
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
    if (player === next) {
      player = null;
      activeVideo = null;
    }
    return { ok: false, reason: String(error?.message || error) };
  }
}

async function toggleVideo(video) {
  if (IS_DOCUMENT_PIP) {
    return { ok: false, reason: "pip-window" };
  }
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
  if (window !== window.top) {
    cleanupRemoteSource();
    if (shouldUseNativeVideoPip(video)) {
      return launchPlayer(video, { nativeOnly: true });
    }
    try {
      return await openRemoteSource(video);
    } catch (error) {
      console.warn("[PiP addon] Cross-frame Document PiP failed; using native PiP.", error);
      return launchPlayer(video, { nativeOnly: true });
    }
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
  return launchPlayer(video);
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
  if (IS_DOCUMENT_PIP) {
    return;
  }
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
  if (message?.type === "PIP_REMOTE_OPEN" && window === window.top && !IS_DOCUMENT_PIP) {
    openRemoteReceiver(message).then(sendResponse);
    return true;
  }
  if (message?.type === "PIP_REMOTE_RELAY") {
    if (message.event === "state" && remoteReceiver?.sessionId === message.sessionId) {
      remoteReceiver.proxy.update(message.payload);
    } else if (message.event === "control" && remoteSource?.sessionId === message.sessionId) {
      applyRemoteCommand(remoteSource.video, message.payload);
    } else if (message.event === "close" && remoteReceiver?.sessionId === message.sessionId) {
      remoteReceiver.player.close({ pause: false, reason: "source-closed" });
    } else if (message.event === "closed" && remoteSource?.sessionId === message.sessionId) {
      cleanupRemoteSource({
        notify: false,
        pause: Boolean(message.payload?.pause),
      });
    } else if (message.event === "ice") {
      const connection =
        (remoteReceiver?.sessionId === message.sessionId && remoteReceiver.connection) ||
        (remoteSource?.sessionId === message.sessionId && remoteSource.connection) ||
        null;
      handleRemoteIce(message.sessionId, connection, message.payload?.candidate);
    }
    sendResponse({ ok: true });
    return;
  }
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
