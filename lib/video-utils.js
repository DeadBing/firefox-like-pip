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

/** Longest edge of a newly opened Document PiP window, in CSS pixels. */
export const PIP_MAX_EDGE = 720;

export function videoContentSize(video, stream) {
  const track = stream?.getVideoTracks?.()?.[0];
  const settings = typeof track?.getSettings === "function" ? track.getSettings() : {};
  const width =
    Number(settings.width) ||
    Number(video?.videoWidth) ||
    Number(video?.width) ||
    Number(video?.clientWidth) ||
    640;
  const height =
    Number(settings.height) ||
    Number(video?.videoHeight) ||
    Number(video?.height) ||
    Number(video?.clientHeight) ||
    360;
  return {
    width,
    height,
    ratio: width / height || 16 / 9,
  };
}

export function fitSizeToBox(ratio, maxWidth, maxHeight) {
  const safeRatio = ratio > 0 && Number.isFinite(ratio) ? ratio : 16 / 9;
  let width = maxWidth;
  let height = width / safeRatio;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * safeRatio;
  }
  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
}

/**
 * Size the Document PiP viewport to the video's real aspect ratio.
 * The old 480×270 box forced portrait/ultrawide clips into a 16:9 hole,
 * which Chrome then clamped — so the player either letterboxed or clipped.
 */
export function pipWindowSize(video, maxWidth = PIP_MAX_EDGE, maxHeight = PIP_MAX_EDGE, stream) {
  const { ratio } = videoContentSize(video, stream);
  return fitSizeToBox(ratio, maxWidth, maxHeight);
}

export function pipRequestOptions(video, stream) {
  const size = pipWindowSize(video, PIP_MAX_EDGE, PIP_MAX_EDGE, stream);
  return {
    width: size.width,
    height: size.height,
    preferInitialWindowPlacement: true,
  };
}

export function windowChromeSize(win) {
  if (!win) {
    return { width: 0, height: 0 };
  }
  return {
    width: Math.max(0, (Number(win.outerWidth) || 0) - (Number(win.innerWidth) || 0)),
    height: Math.max(0, (Number(win.outerHeight) || 0) - (Number(win.innerHeight) || 0)),
  };
}

export function outerSizeForInner(win, innerWidth, innerHeight) {
  const chrome = windowChromeSize(win);
  return {
    width: Math.round(innerWidth + chrome.width),
    height: Math.round(innerHeight + chrome.height),
  };
}

export function aspectMismatch(width, height, ratio, epsilon = 0.02) {
  if (!width || !height || !ratio) {
    return true;
  }
  return Math.abs(width / height - ratio) > epsilon;
}

/** Grow the short side of a viewport so it matches `ratio` without shrinking the video. */
export function growInnerToAspect(innerWidth, innerHeight, ratio) {
  const safeRatio = ratio > 0 && Number.isFinite(ratio) ? ratio : 16 / 9;
  const current = innerWidth / innerHeight || safeRatio;
  if (current > safeRatio) {
    return {
      width: Math.round(innerWidth),
      height: Math.round(innerWidth / safeRatio),
    };
  }
  return {
    width: Math.round(innerHeight * safeRatio),
    height: Math.round(innerHeight),
  };
}

/** Keep the edge the user dragged; adjust the other so the ratio stays locked. */
export function snapInnerToAspect(innerWidth, innerHeight, ratio, previous) {
  const safeRatio = ratio > 0 && Number.isFinite(ratio) ? ratio : 16 / 9;
  if (!previous) {
    return growInnerToAspect(innerWidth, innerHeight, safeRatio);
  }
  const deltaWidth = Math.abs(innerWidth - previous.width);
  const deltaHeight = Math.abs(innerHeight - previous.height);
  if (deltaWidth >= deltaHeight) {
    return {
      width: Math.round(innerWidth),
      height: Math.round(innerWidth / safeRatio),
    };
  }
  return {
    width: Math.round(innerHeight * safeRatio),
    height: Math.round(innerHeight),
  };
}
