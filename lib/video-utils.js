export const MIN_VIDEO_DIMENSION = 140;
export const DEFAULT_MIN_VIDEO_SECS = 45;

/**
 * Firefox videocontrols.js shouldShowPictureInPictureToggle heuristics.
 * Audio is no longer required in current Firefox; duration + size are.
 */
export function shouldShowPictureInPictureToggle(video, settings, dimensions) {
  if (!video) {
    return false;
  }
  if (settings.respectDisablePictureInPicture && video.disablePictureInPicture) {
    return false;
  }
  if (settings.alwaysShowToggle) {
    return true;
  }
  const duration = video.duration;
  if (Number.isNaN(duration)) {
    return false;
  }
  const minSecs = Number.isFinite(settings.minVideoSecs)
    ? settings.minVideoSecs
    : DEFAULT_MIN_VIDEO_SECS;
  if (Number.isFinite(duration) && duration < minSecs) {
    return false;
  }
  const width = dimensions?.videoWidth ?? video.clientWidth ?? 0;
  const height = dimensions?.videoHeight ?? video.clientHeight ?? 0;
  const minDim = Number.isFinite(settings.minVideoDimension)
    ? settings.minVideoDimension
    : MIN_VIDEO_DIMENSION;
  if (width < minDim || height < minDim) {
    return false;
  }
  return true;
}

export function isLiveStream(video) {
  return !Number.isFinite(video?.duration) || video.duration === Number.POSITIVE_INFINITY;
}

export function visibleArea(rect, viewportWidth, viewportHeight) {
  const left = Math.max(rect.left, 0);
  const top = Math.max(rect.top, 0);
  const right = Math.min(rect.right, viewportWidth);
  const bottom = Math.min(rect.bottom, viewportHeight);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

/**
 * Pick the most relevant video, matching Firefox Ctrl+Shift+] behavior:
 * prefer a playing, on-screen video, then the largest visible one.
 */
export function scoreVideo(video, viewport = { width: 1920, height: 1080 }) {
  if (!video) {
    return -1;
  }
  const rect = video.getBoundingClientRect?.() ?? {
    left: 0,
    top: 0,
    right: video.clientWidth || 0,
    bottom: video.clientHeight || 0,
    width: video.clientWidth || 0,
    height: video.clientHeight || 0,
  };
  const visible = visibleArea(rect, viewport.width, viewport.height);
  const area = Math.max(0, rect.width) * Math.max(0, rect.height);
  let score = visible + area * 0.05;
  if (!video.paused && !video.ended) {
    score += 1_000_000_000;
  }
  if ((video.readyState ?? 0) >= 2) {
    score += 1_000_000;
  }
  if (video.disablePictureInPicture) {
    score -= 500_000;
  }
  return score;
}

export function pickBestVideo(videos, viewport) {
  let best = null;
  let bestScore = -1;
  for (const video of videos) {
    const score = scoreVideo(video, viewport);
    if (score > bestScore) {
      best = video;
      bestScore = score;
    }
  }
  return best;
}

export function collectVideos(root = document, into = []) {
  if (!root) {
    return into;
  }
  const list =
    root.querySelectorAll?.("video") ??
    root.getElementsByTagName?.("video") ??
    [];
  for (const video of list) {
    into.push(video);
  }
  const walkRoot = root.body ?? root;
  const tree = walkRoot?.querySelectorAll?.("*") ?? [];
  for (const el of tree) {
    if (el.shadowRoot) {
      collectVideos(el.shadowRoot, into);
    }
  }
  return into;
}

export function pipWindowSize(video, maxWidth = 480, maxHeight = 270) {
  const vw = video.videoWidth || video.clientWidth || 640;
  const vh = video.videoHeight || video.clientHeight || 360;
  const ratio = vw / vh || 16 / 9;
  let width = Math.min(maxWidth, Math.max(240, vw));
  let height = Math.round(width / ratio);
  if (height > maxHeight) {
    height = maxHeight;
    width = Math.round(height * ratio);
  }
  return { width, height };
}
