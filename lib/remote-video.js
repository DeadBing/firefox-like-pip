export function snapshotVideo(video, title = "") {
  return {
    title,
    paused: Boolean(video.paused),
    ended: Boolean(video.ended),
    currentTime: Number(video.currentTime) || 0,
    duration: Number.isFinite(video.duration) ? video.duration : null,
    volume: Number.isFinite(video.volume) ? video.volume : 1,
    muted: Boolean(video.muted),
    playbackRate: Number(video.playbackRate) || 1,
    readyState: Number(video.readyState) || 0,
    videoWidth: Number(video.videoWidth) || Number(video.clientWidth) || 640,
    videoHeight: Number(video.videoHeight) || Number(video.clientHeight) || 360,
  };
}

export const HIGH_QUALITY_BITRATE = 25_000_000;

export const HIGH_QUALITY_ENCODING = {
  scaleResolutionDownBy: 1,
  maxBitrate: HIGH_QUALITY_BITRATE,
  maxFramerate: 60,
  priority: "high",
  networkPriority: "high",
};

/** Put full-res encodings in the offer. addTrack + setParameters often runs too early (encodings is []). */
export function addHighQualityVideoTrack(connection, track, stream) {
  if (typeof connection?.addTransceiver === "function") {
    try {
      return connection.addTransceiver(track, {
        direction: "sendonly",
        streams: stream ? [stream] : [],
        sendEncodings: [{ ...HIGH_QUALITY_ENCODING }],
      });
    } catch {
      /* Older Chromium rejected sendEncodings on addTransceiver. */
    }
  }
  return connection.addTrack(track, stream);
}

export async function preserveVideoQuality(track, sender, video) {
  if (track) {
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
  }
  if (!sender?.getParameters || !sender.setParameters) {
    return;
  }
  const parameters = sender.getParameters();
  parameters.degradationPreference = "maintain-resolution";
  const encodings = parameters.encodings?.length ? parameters.encodings : [{}];
  for (const encoding of encodings) {
    encoding.scaleResolutionDownBy = HIGH_QUALITY_ENCODING.scaleResolutionDownBy;
    encoding.maxBitrate = HIGH_QUALITY_ENCODING.maxBitrate;
    encoding.maxFramerate = HIGH_QUALITY_ENCODING.maxFramerate;
    encoding.priority = HIGH_QUALITY_ENCODING.priority;
    encoding.networkPriority = HIGH_QUALITY_ENCODING.networkPriority;
  }
  parameters.encodings = encodings;
  try {
    await sender.setParameters(parameters);
  } catch {
    /* Chrome rejects encodings that were not negotiated yet. */
  }
}

export function preferHighQualityCodecs(connection) {
  const transceivers = connection?.getTransceivers?.() ?? [];
  const caps = globalThis.RTCRtpSender?.getCapabilities?.("video");
  if (!caps?.codecs?.length) {
    return;
  }
  const isRepair = (codec) => /rtx|red|fec/i.test(String(codec.mimeType || ""));
  const rank = (codec) => {
    const mime = String(codec.mimeType || "").toLowerCase();
    if (mime.includes("vp9")) {
      return 0;
    }
    if (mime.includes("av1")) {
      return 1;
    }
    if (mime.includes("h264")) {
      return 2;
    }
    return 3;
  };
  const primary = caps.codecs.filter((codec) => !isRepair(codec));
  const repair = caps.codecs.filter(isRepair);
  const ordered = [...primary].sort((left, right) => rank(left) - rank(right)).concat(repair);
  for (const transceiver of transceivers) {
    if (transceiver.sender?.track?.kind === "video" || transceiver.receiver?.track?.kind === "video") {
      transceiver.setCodecPreferences?.(ordered);
    }
  }
}

export async function preserveConnectionQuality(connection, video) {
  preferHighQualityCodecs(connection);
  for (const sender of connection?.getSenders?.() ?? []) {
    if (sender.track?.kind === "video") {
      await preserveVideoQuality(sender.track, sender, video).catch(() => {});
    }
  }
}

export class RemoteVideo extends EventTarget {
  constructor(stream, state, send) {
    super();
    this.stream = stream;
    this.state = {};
    this.send = send;
    this.disablePictureInPicture = false;
    this.textTracks = [];
    this.update(state);
  }

  update(state) {
    Object.assign(this.state, state, {
      duration: state?.duration == null ? Number.POSITIVE_INFINITY : state.duration,
    });
    this.dispatchEvent(new Event("timeupdate"));
  }

  command(name, value) {
    this.send?.({ name, value });
    this.dispatchEvent(new Event("timeupdate"));
  }

  captureStream() {
    return this.stream;
  }

  play() {
    this.state.paused = false;
    this.state.ended = false;
    this.command("play");
    return Promise.resolve();
  }

  pause() {
    this.state.paused = true;
    this.command("pause");
  }

  get title() { return this.state.title || ""; }
  get paused() { return this.state.paused; }
  get ended() { return this.state.ended; }
  get duration() { return this.state.duration; }
  get readyState() { return this.state.readyState; }
  get videoWidth() { return this.state.videoWidth; }
  get videoHeight() { return this.state.videoHeight; }
  get clientWidth() { return this.state.videoWidth; }
  get clientHeight() { return this.state.videoHeight; }

  get currentTime() { return this.state.currentTime; }
  set currentTime(value) {
    this.state.currentTime = Number(value) || 0;
    this.command("currentTime", this.state.currentTime);
  }

  get volume() { return this.state.volume; }
  set volume(value) {
    this.state.volume = Number(value);
    this.command("volume", this.state.volume);
  }

  get muted() { return this.state.muted; }
  set muted(value) {
    this.state.muted = Boolean(value);
    this.command("muted", this.state.muted);
  }

  get playbackRate() { return this.state.playbackRate; }
  set playbackRate(value) {
    this.state.playbackRate = Number(value) || 1;
    this.command("playbackRate", this.state.playbackRate);
  }
}
