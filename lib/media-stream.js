/** Cross-origin file URLs (not MSE blobs) cannot be cloned; captureStream is black. */
export function videoFrameCaptureBlocked(video) {
  if (!video) {
    return true;
  }
  const src = video.currentSrc || video.src || "";
  if (!src || src.startsWith("blob:") || src.startsWith("mediastream:") || src.startsWith("data:")) {
    return false;
  }
  try {
    const origin = globalThis.location?.origin;
    if (!origin) {
      return false;
    }
    const url = new URL(src, globalThis.location.href);
    return url.origin !== origin && !video.crossOrigin;
  } catch {
    return false;
  }
}

/** drawImage throws when the decoder marked the element as tainted. */
export function videoPaintIsTainted(video) {
  const doc = globalThis.document;
  if (!video || !doc?.createElement) {
    return false;
  }
  const canvas = doc.createElement("canvas");
  canvas.width = 2;
  canvas.height = 2;
  const context = canvas.getContext("2d");
  if (!context) {
    return false;
  }
  try {
    context.drawImage(video, 0, 0, 2, 2);
    context.getImageData(0, 0, 1, 1);
    return false;
  } catch {
    return true;
  }
}

export function shouldUseNativeVideoPip(video) {
  return videoFrameCaptureBlocked(video) || videoPaintIsTainted(video);
}

export function streamVideoTrack(stream) {
  return stream?.getVideoTracks?.()?.find((track) => track.readyState !== "ended") ?? null;
}

export function isElementVideo(video) {
  return typeof video?.tagName === "string" && video.tagName.toUpperCase() === "VIDEO";
}

/** True when captureStream / the on-page box is smaller than the decoded frames. */
export function capturedSizeLooksDownscaled(video, track) {
  const decodedW = Number(video?.videoWidth) || 0;
  const decodedH = Number(video?.videoHeight) || 0;
  if (decodedW < 2 || decodedH < 2) {
    return false;
  }
  const settings = typeof track?.getSettings === "function" ? track.getSettings() : {};
  const capW = Number(settings.width) || Number(video?.clientWidth) || 0;
  const capH = Number(settings.height) || Number(video?.clientHeight) || 0;
  return (capW > 0 && capW < decodedW * 0.85) || (capH > 0 && capH < decodedH * 0.85);
}

/** Ask the captured track for the source's decoded size, not the on-page box. */
export async function applyTrackResolution(track, video) {
  if (!track) {
    return track;
  }
  track.contentHint = "detail";
  const width = Number(video?.videoWidth) || 0;
  const height = Number(video?.videoHeight) || 0;
  if (width >= 2 && height >= 2 && typeof track.applyConstraints === "function") {
    await track
      .applyConstraints({
        width: { ideal: width },
        height: { ideal: height },
        frameRate: { ideal: 60 },
      })
      .catch(() => {});
  }
  return track;
}

/** Copy inbound WebRTC tracks onto the stream the PiP <video> is bound to. */
export function adoptIncomingTrack(stream, event) {
  if (!stream?.addTrack || !event) {
    return streamVideoTrack(stream);
  }
  const pending = [];
  for (const incoming of event.streams ?? []) {
    for (const track of incoming.getTracks?.() ?? []) {
      pending.push(track);
    }
  }
  if (event.track) {
    pending.push(event.track);
  }
  const have = new Set(stream.getTracks?.() ?? []);
  for (const track of pending) {
    if (!track || have.has(track)) {
      continue;
    }
    stream.addTrack(track);
    have.add(track);
  }
  return streamVideoTrack(stream);
}

export function waitForVideoTrack(stream, timeoutMs = 2500) {
  const existing = streamVideoTrack(stream);
  if (existing) {
    return Promise.resolve(existing);
  }
  if (!stream?.addEventListener) {
    return Promise.reject(new Error("The captured video stream has no video track"));
  }
  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(() => {
      stream.removeEventListener("addtrack", onAdd);
      reject(new Error("The remote video track did not arrive"));
    }, timeoutMs);
    const onAdd = (event) => {
      if (event.track?.kind !== "video" || event.track.readyState === "ended") {
        return;
      }
      globalThis.clearTimeout(timer);
      stream.removeEventListener("addtrack", onAdd);
      resolve(event.track);
    };
    stream.addEventListener("addtrack", onAdd);
  });
}

/**
 * Keep a <video> bound to a live MediaStream.
 * Chrome does not always start painting if tracks are added after srcObject
 * is first assigned — the iframe WebRTC bridge hits that race.
 */
export function attachStreamToVideo(video, stream) {
  if (!video || !stream) {
    return () => {};
  }
  const unmutes = [];
  const watchUnmute = (track) => {
    if (!track?.addEventListener) {
      return;
    }
    const onUnmute = () => bind();
    track.addEventListener("unmute", onUnmute);
    unmutes.push(() => track.removeEventListener("unmute", onUnmute));
  };
  const bind = () => {
    video.srcObject = stream;
    video.muted = true;
    video.play()?.catch(() => {});
  };
  bind();
  const onAddTrack = (event) => {
    if (event.track?.kind === "video") {
      watchUnmute(event.track);
      bind();
    }
  };
  stream.addEventListener?.("addtrack", onAddTrack);
  for (const track of stream.getVideoTracks?.() ?? []) {
    watchUnmute(track);
  }
  return () => {
    stream.removeEventListener?.("addtrack", onAddTrack);
    for (const unbind of unmutes) {
      unbind();
    }
  };
}

/**
 * captureStream() often matches the on-page box (a 360px iframe, a small
 * YouTube player). Paint a full-resolution canvas clone when the decoded
 * frames are larger and the element is not CORS-tainted.
 */
export function captureVideoStream(video) {
  let stream = null;
  try {
    try {
      stream = video.captureStream(0);
    } catch (error) {
      if (error?.name !== "TypeError") {
        throw error;
      }
      stream = video.captureStream();
    }
    const track = streamVideoTrack(stream);
    if (track) {
      applyTrackResolution(track, video);
      const useCanvas =
        isElementVideo(video) &&
        capturedSizeLooksDownscaled(video, track) &&
        !videoFrameCaptureBlocked(video) &&
        !videoPaintIsTainted(video);
      if (!useCanvas) {
        return { stream, mode: "element" };
      }
      for (const item of stream.getTracks?.() ?? []) {
        item.stop();
      }
      stream = null;
    } else {
      for (const item of stream.getTracks?.() ?? []) {
        item.stop();
      }
      stream = null;
    }
  } catch {
    /* Fall through to a canvas clone when the element is not tainted. */
  }
  if (videoFrameCaptureBlocked(video) || videoPaintIsTainted(video)) {
    const error = new Error("The embed video cannot be cloned");
    error.code = "TAINTED";
    throw error;
  }
  return { stream: startCanvasCapture(video), mode: "canvas" };
}

export function startCanvasCapture(video) {
  const doc = globalThis.document;
  const canvas = doc.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("The embed video cannot be cloned");
  }
  let running = true;
  const draw = () => {
    if (!running) {
      return;
    }
    const width = Number(video.videoWidth) || Number(video.clientWidth) || 640;
    const height = Number(video.videoHeight) || Number(video.clientHeight) || 360;
    if (width && height && (canvas.width !== width || canvas.height !== height)) {
      canvas.width = width;
      canvas.height = height;
    }
    try {
      if (video.readyState >= 2 && canvas.width && canvas.height) {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
    } catch {
      running = false;
      return;
    }
    globalThis.requestAnimationFrame(draw);
  };
  globalThis.requestAnimationFrame(draw);
  let stream;
  try {
    stream = canvas.captureStream(0);
  } catch {
    stream = canvas.captureStream(60);
  }
  const stop = stream.getTracks?.()[0];
  if (stop) {
    const original = stop.stop.bind(stop);
    stop.stop = () => {
      running = false;
      original();
    };
  }
  return stream;
}
