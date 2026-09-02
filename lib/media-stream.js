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
  const bind = () => {
    video.srcObject = stream;
    video.muted = true;
    video.play()?.catch(() => {});
  };
  bind();
  const onAddTrack = (event) => {
    if (event.track?.kind === "video") {
      bind();
    }
  };
  stream.addEventListener?.("addtrack", onAddTrack);
  const unmutes = [];
  for (const track of stream.getVideoTracks?.() ?? []) {
    const onUnmute = () => bind();
    track.addEventListener?.("unmute", onUnmute);
    unmutes.push(() => track.removeEventListener?.("unmute", onUnmute));
  }
  return () => {
    stream.removeEventListener?.("addtrack", onAddTrack);
    for (const unbind of unmutes) {
      unbind();
    }
  };
}
