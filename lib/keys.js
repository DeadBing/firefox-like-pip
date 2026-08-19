import { clamp } from "./format.js";

export const SEEK_TIME_SECS = 5;
export const VOLUME_STEP = 0.1;

export function isMacPlatform(platform = "") {
  return /Mac|iPhone|iPad|iPod/i.test(platform);
}

/**
 * Build the Firefox PictureInPictureChild keystroke token.
 * Accel is Meta on macOS and Ctrl elsewhere.
 */
export function buildKeystroke({
  altKey = false,
  shiftKey = false,
  metaKey = false,
  ctrlKey = false,
  key = "",
  platform = "",
} = {}) {
  let keystroke = "";
  if (altKey) {
    keystroke += "alt-";
  }
  if (shiftKey) {
    keystroke += "shift-";
  }
  const mac = isMacPlatform(platform);
  if (mac) {
    if (metaKey) {
      keystroke += "accel-";
    }
    if (ctrlKey) {
      keystroke += "control-";
    }
  } else {
    if (metaKey) {
      keystroke += "meta-";
    }
    if (ctrlKey) {
      keystroke += "accel-";
    }
  }

  const map = {
    ArrowUp: "upArrow",
    ArrowDown: "downArrow",
    ArrowLeft: "leftArrow",
    ArrowRight: "rightArrow",
    Home: "home",
    End: "end",
    " ": "space",
    Spacebar: "space",
    w: "w",
    W: "w",
    f: "f",
    F: "f",
    Escape: "escape",
  };
  const token = map[key];
  if (!token) {
    return keystroke;
  }
  return keystroke + token;
}

function roundedVolume(value) {
  return Math.round(clamp(value, 0, 1) * 100) / 100;
}

export function applyKeystroke(video, keystroke, options = {}) {
  if (!video) {
    return { action: "none" };
  }
  const live = options.isLive === true;
  const pauseOnClose = options.pauseOnClose !== false;

  switch (keystroke) {
    case "space": {
      if (video.paused || video.ended) {
        video.play?.();
        return { action: "play" };
      }
      video.pause?.();
      return { action: "pause" };
    }
    case "accel-w": {
      if (pauseOnClose) {
        video.pause?.();
      }
      return { action: "close", pause: pauseOnClose };
    }
    case "shift-escape": {
      return { action: "close", pause: false };
    }
    case "escape": {
      if (options.isFullscreen) {
        return { action: "exit-fullscreen" };
      }
      if (pauseOnClose) {
        video.pause?.();
      }
      return { action: "close", pause: pauseOnClose };
    }
    case "f": {
      return { action: "fullscreen" };
    }
    case "downArrow": {
      if (video.muted) {
        return { action: "none" };
      }
      const next = roundedVolume((video.volume ?? 1) - VOLUME_STEP);
      video.volume = next;
      video.muted = next === 0;
      return { action: "volume", volume: next };
    }
    case "upArrow": {
      const next = roundedVolume((video.volume ?? 0) + VOLUME_STEP);
      video.volume = next;
      video.muted = false;
      return { action: "volume", volume: next };
    }
    case "accel-downArrow": {
      video.muted = true;
      return { action: "mute" };
    }
    case "accel-upArrow": {
      video.muted = false;
      return { action: "unmute" };
    }
    case "leftArrow":
    case "accel-leftArrow": {
      if (live) {
        return { action: "none" };
      }
      const delta =
        keystroke === "leftArrow"
          ? SEEK_TIME_SECS
          : (video.duration || 0) / 10;
      video.currentTime = Math.max(0, (video.currentTime || 0) - delta);
      return { action: "seek", currentTime: video.currentTime };
    }
    case "rightArrow":
    case "accel-rightArrow": {
      if (live) {
        return { action: "none" };
      }
      const duration = video.duration || 0;
      const delta =
        keystroke === "rightArrow" ? SEEK_TIME_SECS : duration / 10;
      video.currentTime = Math.min(duration, (video.currentTime || 0) + delta);
      return { action: "seek", currentTime: video.currentTime };
    }
    case "home": {
      if (!live) {
        video.currentTime = 0;
      }
      return { action: "seek", currentTime: video.currentTime };
    }
    case "end": {
      if (!live && Number.isFinite(video.duration)) {
        video.currentTime = video.duration;
      }
      return { action: "seek", currentTime: video.currentTime };
    }
    default:
      return { action: "none" };
  }
}

export function handlePlayerKey(video, event, options = {}) {
  const keystroke = buildKeystroke({
    altKey: event.altKey,
    shiftKey: event.shiftKey,
    metaKey: event.metaKey,
    ctrlKey: event.ctrlKey,
    key: event.key,
    platform: options.platform,
  });
  return applyKeystroke(video, keystroke, {
    ...options,
    isFullscreen: options.isFullscreen,
    pauseOnClose: event.shiftKey ? false : options.pauseOnClose,
  });
}

/** Firefox page shortcut: Ctrl+Shift+] (macOS: Cmd+Shift+Option+]). */
export function isToggleShortcut(event, platform = "") {
  const mac = isMacPlatform(platform);
  if (event.code !== "BracketRight" && event.key !== "]") {
    return false;
  }
  if (mac) {
    return event.metaKey && event.shiftKey && event.altKey && !event.ctrlKey;
  }
  return event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey;
}
