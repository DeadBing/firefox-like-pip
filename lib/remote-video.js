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
