import { formatTimestamp, progressRatio } from "../lib/format.js";
import { captionFontScale, pageCaptionText, showingCaptionText } from "../lib/captions.js";
import { SEEK_TIME_SECS, handlePlayerKey, isMacPlatform } from "../lib/keys.js";
import {
  aspectMismatch,
  growInnerToAspect,
  isLiveStream,
  outerSizeForInner,
  pipRequestOptions,
  pipWindowSize,
  snapInnerToAspect,
  videoContentSize,
} from "../lib/video-utils.js";

const ICONS = {
  close:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M3.2 2.1 8 6.9l4.8-4.8 1.1 1.1L9.1 8l4.8 4.8-1.1 1.1L8 9.1l-4.8 4.8-1.1-1.1L6.9 8 2.1 3.2z"/></svg>',
  unpip:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5V7h-1.5V3.5h-9v9H7V14H3.5A1.5 1.5 0 0 1 2 12.5zm7 5A1.5 1.5 0 0 1 10.5 7H14a1.5 1.5 0 0 1 1.5 1.5v4A1.5 1.5 0 0 1 14 14h-3.5A1.5 1.5 0 0 1 9 12.5z"/></svg>',
  play: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M4 2.5v11l9-5.5z"/></svg>',
  pause:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M3.5 2.5h3v11h-3zm6 0h3v11h-3z"/></svg>',
  back: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8.2 3.2 3.4 8l4.8 4.8 1-1L6.4 9H13V7H6.4l2.8-2.8z"/></svg>',
  forward:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M7.8 3.2 12.6 8l-4.8 4.8-1-1L9.6 9H3V7h6.6L6.8 4.2z"/></svg>',
  audio:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M2 6.2h2.4L8 3.5v9L4.4 9.8H2zm8 1.8a2 2 0 0 0-1.2-1.8v3.6A2 2 0 0 0 10 8zm0-3.3A5.2 5.2 0 0 1 13.1 8 5.2 5.2 0 0 1 10 11.3v1.5A6.7 6.7 0 0 0 14.6 8 6.7 6.7 0 0 0 10 3.2z"/></svg>',
  muted:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M2 6.2h2.4L8 3.5v9L4.4 9.8H2zm11.2-2.6 1.1 1.1L12.1 7l2.2 2.3-1.1 1.1L11 8.1l-2.2 2.3-1.1-1.1L9.9 7 7.7 4.7l1.1-1.1L11 5.9z"/></svg>',
  cc: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M1.5 4h13v8h-13zm2.4 5.7c.5.6 1.2.9 2 .9.7 0 1.2-.2 1.6-.6l.7.8c-.6.6-1.4.9-2.4.9-1.2 0-2.1-.4-2.8-1.2S2.1 8.7 2.1 7.5s.4-2.2 1.1-2.9 1.6-1.1 2.8-1.1c1 0 1.8.3 2.4.9l-.7.8c-.4-.4-.9-.6-1.6-.6-.8 0-1.5.3-2 .9S3.4 6.7 3.4 7.5s.2 1.6.5 2.2zm5.7 0c.5.6 1.2.9 2 .9.7 0 1.2-.2 1.6-.6l.7.8c-.6.6-1.4.9-2.4.9-1.2 0-2.1-.4-2.8-1.2s-1-1.8-1-3s.4-2.2 1.1-2.9 1.6-1.1 2.8-1.1c1 0 1.8.3 2.4.9l-.7.8c-.4-.4-.9-.6-1.6-.6-.8 0-1.5.3-2 .9s-.5 1.4-.5 2.2.2 1.6.5 2.2z"/></svg>',
  speed:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 1.5A6.5 6.5 0 1 1 1.5 8 6.5 6.5 0 0 1 8 1.5M8 3a5 5 0 1 0 5 5A5 5 0 0 0 8 3m.8 2v2.4l2 1.2-.8 1.2L7 8.2V5z"/></svg>',
  enterFs:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M3 3h4v1.5H4.5V7H3zm9 0h1v4h-1.5V4.5H9V3zM3 9h1.5v2.5H7V13H3zm8.5 2.5V9H13v4H9v-1.5z"/></svg>',
  exitFs:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M5.5 2.5v3H2.5V4h1.5V2.5zm5 0H13V4h1.5v1.5H10.5zM2.5 10.5h3V13H4v-1.5H2.5zm8 0H13.5V9H12v1.5h-1.5z"/></svg>',
};

Object.assign(ICONS, {
  muted:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M1.5 6h2.8L8 3v10l-3.7-3H1.5z"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5" d="m10.5 5.5 4 5m0-5-4 5"/></svg>',
  cc: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="3.25" width="13" height="9.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.3" d="M6.4 6.5a2 2 0 1 0 0 3m5.4-3a2 2 0 1 0 0 3"/></svg>',
});

function button(id, tooltip, icon, extraClass = "") {
  return `<button type="button" id="${id}" class="control-item control-button ${extraClass}" data-tooltip="${tooltip}">${icon}</button>`;
}

function playerMarkup(strings) {
  return `
    <div class="player-holder">
      <div class="video-stage">
        <video id="pip-video" playsinline disablepictureinpicture></video>
      </div>
      <div id="captions"></div>
      <div id="controls" showing>
        ${button("unpip", strings.unpip, ICONS.unpip)}
        ${button("close", strings.close, ICONS.close)}
        <div id="controls-bottom-gradient" class="control-item"></div>
        <div id="controls-bottom">
          <div class="controls-bottom-upper">
            <div class="scrubber-no-drag">
              <input id="scrubber" class="control-item" type="range" min="0" max="1000" value="0" step="1" />
            </div>
          </div>
          <div class="controls-bottom-lower">
            <div class="start-controls">
              <span id="timestamp" class="control-item">0:00 / 0:00</span>
            </div>
            <div class="center-controls">
              ${button("seekBackward", strings.seekBack, ICONS.back)}
              ${button("playpause", strings.play, ICONS.play)}
              ${button("seekForward", strings.seekForward, ICONS.forward)}
            </div>
            <div class="end-controls">
              ${button("audio", strings.mute, ICONS.audio, "center-tooltip")}
              <input id="audio-scrubber" class="control-item" type="range" min="0" max="1" step="0.01" value="1" />
              ${button("closed-caption", strings.captions, ICONS.cc)}
              ${button("speed", strings.speed, ICONS.speed)}
              ${button("fullscreen", strings.fullscreen, ICONS.enterFs)}
            </div>
          </div>
        </div>
        <div id="cc-settings" class="panel hide">
          <div class="subtitle-grid">
            <span>${strings.subtitles}</span>
            <label class="switch">
              <input id="subtitles-toggle" type="checkbox" checked />
              <span class="slider"></span>
            </label>
          </div>
          <div class="grey-line"></div>
          <h2>${strings.fontSize}</h2>
          <label><input type="radio" name="cc-size" value="small" /> ${strings.small}</label>
          <label><input type="radio" name="cc-size" value="medium" checked /> ${strings.medium}</label>
          <label><input type="radio" name="cc-size" value="large" /> ${strings.large}</label>
        </div>
        <div id="speed-settings" class="panel hide">
          <h2>${strings.speed}</h2>
          ${[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]
            .map(
              (rate) =>
                `<label><input type="radio" name="speed" value="${rate}" ${
                  rate === 1 ? "checked" : ""
                } /> ${rate === 1 ? strings.normal : `${rate}×`}</label>`
            )
            .join("")}
        </div>
      </div>
    </div>
  `;
}

function localize() {
  const t = (key, fallback) =>
    typeof chrome !== "undefined" && chrome.i18n?.getMessage(key)
      ? chrome.i18n.getMessage(key)
      : fallback;
  return {
    unpip: t("unpipTooltip", "Back to tab"),
    close: t("closeTooltip", "Close (Ctrl+W). Shift+click keeps playing"),
    play: t("playTooltip", "Play (Space)"),
    pause: t("pauseTooltip", "Pause (Space)"),
    seekBack: t("seekBackTooltip", "Back 5 seconds"),
    seekForward: t("seekForwardTooltip", "Forward 5 seconds"),
    mute: t("muteTooltip", "Mute (Ctrl+↓)"),
    unmute: t("unmuteTooltip", "Unmute (Ctrl+↑)"),
    captions: t("captionsTooltip", "Captions"),
    speed: t("speedTooltip", "Playback speed"),
    fullscreen: t("fullscreenTooltip", "Fullscreen (F)"),
    exitFullscreen: t("exitFullscreenTooltip", "Exit fullscreen (F)"),
    subtitles: t("subtitlesLabel", "Subtitles"),
    fontSize: t("fontSizeLabel", "Font size"),
    small: t("fontSmall", "Small"),
    medium: t("fontMedium", "Medium"),
    large: t("fontLarge", "Large"),
    normal: t("speedNormal", "Normal"),
  };
}

export class PipPlayer {
  constructor({ sourceVideo, settings, openerWindow, onClose }) {
    this.sourceVideo = sourceVideo;
    this.settings = settings;
    this.openerWindow = openerWindow;
    this.onClose = onClose;
    this.pipWindow = null;
    this.stream = null;
    this.usingNative = false;
    this.maximized = false;
    this.restoreBounds = null;
    this.strings = localize();
    this.captionTimer = 0;
    this.hideTimer = 0;
    this.resizeSnapTimer = 0;
    this.fittingWindow = false;
    this.lastInnerSize = null;
    this.bound = [];
    this.sourceBound = [];
  }

  contentSize() {
    return videoContentSize(this.sourceVideo, this.stream);
  }

  desiredInnerSize() {
    return pipWindowSize(this.sourceVideo, undefined, undefined, this.stream);
  }

  applyVideoAspect() {
    const video = this.pipWindow && !this.pipWindow.closed ? this.qs("pip-video") : null;
    if (!video) {
      return;
    }
    const { width, height, ratio } = this.contentSize();
    if (!ratio) {
      return;
    }
    video.style.aspectRatio = `${width} / ${height}`;
    this.pipWindow.document.documentElement.style.setProperty("--pip-aspect", String(ratio));
  }

  fitPipWindow({ mode = "desired" } = {}) {
    if (!this.pipWindow || this.pipWindow.closed || this.maximized || this.usingNative) {
      return false;
    }
    const { ratio } = this.contentSize();
    const win = this.pipWindow;
    const innerWidth = Number(win.innerWidth) || 0;
    const innerHeight = Number(win.innerHeight) || 0;
    if (!innerWidth || !innerHeight) {
      return false;
    }

    let next;
    if (mode === "snap") {
      next = snapInnerToAspect(innerWidth, innerHeight, ratio, this.lastInnerSize);
    } else if (mode === "grow") {
      next = growInnerToAspect(innerWidth, innerHeight, ratio);
    } else {
      next = this.desiredInnerSize();
    }

    if (!aspectMismatch(innerWidth, innerHeight, ratio)) {
      this.lastInnerSize = { width: innerWidth, height: innerHeight };
      return false;
    }

    const outer = outerSizeForInner(win, next.width, next.height);
    this.fittingWindow = true;
    try {
      win.resizeTo(outer.width, outer.height);
      this.lastInnerSize = {
        width: Number(win.innerWidth) || next.width,
        height: Number(win.innerHeight) || next.height,
      };
      return true;
    } catch {
      this.lastInnerSize = { width: innerWidth, height: innerHeight };
      return false;
    } finally {
      const clear = () => {
        this.fittingWindow = false;
      };
      if (typeof win.setTimeout === "function") {
        win.setTimeout(clear, 0);
      } else {
        clear();
      }
    }
  }

  scheduleAspectSnap() {
    if (this.fittingWindow || this.maximized || !this.pipWindow) {
      return;
    }
    if (this.resizeSnapTimer) {
      this.openerWindow.clearTimeout(this.resizeSnapTimer);
    }
    this.resizeSnapTimer = this.openerWindow.setTimeout(() => {
      this.resizeSnapTimer = 0;
      this.fitPipWindow({ mode: "snap" });
    }, 120);
  }

  stillOpen() {
    return !this._tornDown;
  }

  abandonOpen() {
    this.stopStream();
    if (this.pipWindow && !this.pipWindow.closed) {
      this.pipWindow.close();
    }
    this.pipWindow = null;
    return { mode: "aborted" };
  }

  async open() {
    if (this._tornDown) {
      return this.abandonOpen();
    }
    if (!("documentPictureInPicture" in window)) {
      return this.openNative();
    }
    try {
      this.stream = this.sourceVideo.captureStream();
    } catch {
      return this.openNative();
    }
    const existing = window.documentPictureInPicture.window;
    if (existing && !existing.closed) {
      this.pipWindow = existing;
    } else {
      try {
        this.pipWindow = await window.documentPictureInPicture.requestWindow(
          pipRequestOptions(this.sourceVideo, this.stream)
        );
      } catch {
        if (!this.stillOpen()) {
          return this.abandonOpen();
        }
        this.stopStream();
        return this.openNative();
      }
    }
    if (!this.stillOpen()) {
      return this.abandonOpen();
    }

    this.installDocument(this.pipWindow);
    const pipVideo = this.pipWindow.document.getElementById("pip-video");
    try {
      pipVideo.srcObject = this.stream;
      pipVideo.muted = true;
      pipVideo.play().catch(() => {});
    } catch {
      if (this.pipWindow && !this.pipWindow.closed) {
        this.pipWindow.close();
      }
      this.pipWindow = null;
      this.stopStream();
      if (!this.stillOpen()) {
        return this.abandonOpen();
      }
      return this.openNative();
    }
    if (!this.stillOpen()) {
      return this.abandonOpen();
    }

    this.bindSource();
    this.bindControls();
    this.sync();
    this.applyVideoAspect();
    this.revealControls(true);
    this.fitPipWindow({ mode: "grow" });
    return { mode: "document", window: this.pipWindow };
  }

  async openNative() {
    if (!this.stillOpen()) {
      return this.abandonOpen();
    }
    if (!this.sourceVideo.requestPictureInPicture) {
      throw new Error("Picture-in-Picture is not available");
    }
    await this.sourceVideo.requestPictureInPicture();
    if (!this.stillOpen()) {
      document.exitPictureInPicture?.();
      return this.abandonOpen();
    }
    this.usingNative = true;
    this.bindNativeLeave();
    return { mode: "video" };
  }

  bindNativeLeave() {
    this.listenSource(
      this.sourceVideo,
      "leavepictureinpicture",
      () => this.teardown({ pause: this._pendingPause ?? this.settings.pauseOnClose })
    );
  }

  async replaceSource(video) {
    if (!this.stillOpen() || !video) {
      return { ok: false };
    }
    this.unbindSource();
    this.stopStream();
    this.sourceVideo = video;
    if (this.usingNative) {
      await video.requestPictureInPicture();
      if (!this.stillOpen()) {
        return { ok: false };
      }
      this.bindNativeLeave();
      return { ok: true, mode: "video" };
    }
    const pipVideo = this.qs("pip-video");
    this.stream = video.captureStream();
    pipVideo.srcObject = this.stream;
    pipVideo.muted = true;
    await pipVideo.play().catch(() => {});
    if (!this.stillOpen()) {
      return { ok: false };
    }
    this.bindSource();
    this.sync();
    this.applyVideoAspect();
    this.fitPipWindow({ mode: "desired" });
    return { ok: true, mode: "document" };
  }

  installDocument(pipWindow) {
    const doc = pipWindow.document;
    doc.head.replaceChildren();
    doc.body.replaceChildren();
    doc.documentElement.lang = document.documentElement.lang || "en";
    doc.title = this.sourceVideo.title || document.title || "Picture-in-Picture";
    const style = doc.createElement("link");
    style.rel = "stylesheet";
    style.href = chrome.runtime.getURL("pip/player.css");
    doc.head.append(style);
    doc.body.innerHTML = playerMarkup(this.strings);
    if (isMacPlatform(navigator.platform)) {
      doc.body.classList.add("mac");
    }
    this.applyCaptionSize(this.settings.captionFontSize);
  }

  qs(id) {
    return this.pipWindow.document.getElementById(id);
  }

  listenSource(target, type, handler, options) {
    if (!target) {
      return;
    }
    target.addEventListener(type, handler, options);
    this.sourceBound.push(() => target.removeEventListener(type, handler, options));
  }

  unbindSource() {
    for (const unbind of this.sourceBound) {
      unbind();
    }
    this.sourceBound = [];
  }

  bindSource() {
    const events = ["play", "pause", "ended", "timeupdate", "volumechange", "ratechange", "durationchange"];
    for (const type of events) {
      this.listenSource(this.sourceVideo, type, () => this.sync());
    }
    this.listenSource(this.sourceVideo, "loadedmetadata", () => {
      this.sync();
      this.applyVideoAspect();
      this.fitPipWindow({ mode: "desired" });
    });
    this.listenSource(this.sourceVideo, "resize", () => {
      this.applyVideoAspect();
      this.fitPipWindow({ mode: "desired" });
    });
    this.listenSource(this.sourceVideo, "emptied", () => this.close({ pause: false, reason: "emptied" }));
    const track = this.stream?.getVideoTracks?.()[0];
    if (track?.addEventListener) {
      const onTrackResize = () => this.fitPipWindow({ mode: "desired" });
      track.addEventListener("resize", onTrackResize);
      this.sourceBound.push(() => track.removeEventListener("resize", onTrackResize));
    }
  }

  bindControls() {
    const doc = this.pipWindow.document;
    const controls = this.qs("controls");
    this.listen(this.qs("close"), "click", (event) => {
      this.close({ pause: event.shiftKey ? false : this.settings.pauseOnClose, reason: "close" });
    });
    this.listen(this.qs("unpip"), "click", () => {
      this.openerWindow.focus();
      this.close({ pause: false, reason: "unpip" });
    });
    this.listen(this.qs("playpause"), "click", () => this.togglePlay());
    this.listen(this.qs("seekBackward"), "click", () => this.seekBy(-SEEK_TIME_SECS));
    this.listen(this.qs("seekForward"), "click", () => this.seekBy(SEEK_TIME_SECS));
    this.listen(this.qs("audio"), "click", () => this.toggleMute());
    this.listen(this.qs("fullscreen"), "click", () => this.toggleFullscreen());
    this.listen(this.qs("closed-caption"), "click", () => this.togglePanel("cc-settings"));
    this.listen(this.qs("speed"), "click", () => this.togglePanel("speed-settings"));
    this.listen(this.qs("scrubber"), "input", (event) => {
      if (isLiveStream(this.sourceVideo)) {
        return;
      }
      const duration = this.sourceVideo.duration || 0;
      this.sourceVideo.currentTime = (Number(event.target.value) / 1000) * duration;
    });
    this.listen(this.qs("audio-scrubber"), "input", (event) => {
      const volume = Number(event.target.value);
      this.sourceVideo.volume = volume;
      this.sourceVideo.muted = volume === 0;
    });
    this.listen(this.qs("subtitles-toggle"), "change", (event) => {
      this.settings.captionsEnabled = event.target.checked;
      this.updateCaptions();
    });
    for (const radio of doc.querySelectorAll('input[name="cc-size"]')) {
      this.listen(radio, "change", () => {
        if (radio.checked) {
          this.settings.captionFontSize = radio.value;
          this.applyCaptionSize(radio.value);
        }
      });
    }
    for (const radio of doc.querySelectorAll('input[name="speed"]')) {
      this.listen(radio, "change", () => {
        if (radio.checked) {
          this.sourceVideo.playbackRate = Number(radio.value);
        }
      });
    }
    this.listen(controls, "dblclick", (event) => {
      if (event.target.id === "controls") {
        this.toggleFullscreen();
      }
    });
    this.listen(doc, "keydown", (event) => this.onKeyDown(event));
    this.listen(this.pipWindow, "pagehide", () =>
      this.teardown({ pause: this._pendingPause ?? this.settings.pauseOnClose })
    );
    this.listen(this.pipWindow, "resize", () => this.scheduleAspectSnap());
    this.listen(controls, "mousemove", () => this.revealControls(false));
    this.listen(controls, "mouseenter", () => this.showControls());
    this.listen(controls, "mouseleave", () => {
      if (!controls.hasAttribute("keying") && !controls.hasAttribute("donthide")) {
        this.hideControls();
      }
    });
    this.captionTimer = this.openerWindow.setInterval(() => this.updateCaptions(), 250);
  }

  listen(target, type, handler, options) {
    if (!target) {
      return;
    }
    target.addEventListener(type, handler, options);
    this.bound.push(() => target.removeEventListener(type, handler, options));
  }

  onKeyDown(event) {
    if (!this.settings.keyboardControlsEnabled) {
      return;
    }
    const controls = this.qs("controls");
    if (event.key === "Tab") {
      controls?.setAttribute("keying", "");
      this.showControls();
    }
    if (event.key === "Escape" && this.qs("cc-settings") && !this.qs("cc-settings").classList.contains("hide")) {
      this.hidePanels();
      event.preventDefault();
      return;
    }
    const result = handlePlayerKey(this.sourceVideo, event, {
      platform: navigator.platform,
      isLive: isLiveStream(this.sourceVideo),
      isFullscreen: this.maximized,
      pauseOnClose: this.settings.pauseOnClose,
    });
    if (result.action === "none") {
      return;
    }
    event.preventDefault();
    if (result.action === "close") {
      this.close({ pause: result.pause, reason: "shortcut" });
      return;
    }
    if (result.action === "fullscreen" || result.action === "exit-fullscreen") {
      this.toggleFullscreen();
    }
    this.sync();
  }

  togglePlay() {
    if (this.sourceVideo.paused || this.sourceVideo.ended) {
      this.sourceVideo.play()?.catch(() => {});
    } else {
      this.sourceVideo.pause();
    }
  }

  seekBy(delta) {
    if (isLiveStream(this.sourceVideo)) {
      return;
    }
    const duration = this.sourceVideo.duration || 0;
    this.sourceVideo.currentTime = Math.min(
      duration,
      Math.max(0, (this.sourceVideo.currentTime || 0) + delta)
    );
  }

  toggleMute() {
    this.sourceVideo.muted = !this.sourceVideo.muted;
    if (!this.sourceVideo.muted && this.sourceVideo.volume === 0) {
      this.sourceVideo.volume = 1;
    }
  }

  toggleFullscreen() {
    if (!this.pipWindow) {
      return;
    }
    if (this.maximized) {
      const bounds = this.restoreBounds;
      this.maximized = false;
      if (bounds) {
        this.pipWindow.resizeTo(bounds.width, bounds.height);
      }
      this.qs("fullscreen").innerHTML = ICONS.enterFs;
      this.qs("fullscreen").dataset.tooltip = this.strings.fullscreen;
      return;
    }
    this.restoreBounds = {
      width: this.pipWindow.outerWidth,
      height: this.pipWindow.outerHeight,
    };
    this.maximized = true;
    this.pipWindow.resizeTo(
      this.pipWindow.screen.availWidth,
      this.pipWindow.screen.availHeight
    );
    this.qs("fullscreen").innerHTML = ICONS.exitFs;
    this.qs("fullscreen").dataset.tooltip = this.strings.exitFullscreen;
  }

  togglePanel(id) {
    const panel = this.qs(id);
    const other = id === "cc-settings" ? this.qs("speed-settings") : this.qs("cc-settings");
    other?.classList.add("hide");
    const hidden = panel.classList.contains("hide");
    panel.classList.toggle("hide", !hidden);
    const controls = this.qs("controls");
    if (hidden) {
      controls.setAttribute("donthide", "");
      this.showControls();
    } else {
      controls.removeAttribute("donthide");
    }
  }

  hidePanels() {
    this.qs("cc-settings")?.classList.add("hide");
    this.qs("speed-settings")?.classList.add("hide");
    this.qs("controls")?.removeAttribute("donthide");
  }

  applyCaptionSize(size) {
    this.pipWindow?.document.documentElement.style.setProperty(
      "--caption-scale",
      String(captionFontScale(size))
    );
    const radio = this.pipWindow?.document.querySelector(`input[name="cc-size"][value="${size}"]`);
    if (radio) {
      radio.checked = true;
    }
  }

  updateCaptions() {
    const box = this.qs("captions");
    if (!box) {
      return;
    }
    if (!this.settings.captionsEnabled || !this.qs("subtitles-toggle")?.checked) {
      box.textContent = "";
      return;
    }
    box.textContent = showingCaptionText(this.sourceVideo) || pageCaptionText(this.openerWindow.document);
  }

  sync() {
    if (!this.pipWindow || this.pipWindow.closed) {
      return;
    }
    const playing = !this.sourceVideo.paused && !this.sourceVideo.ended;
    this.qs("playpause").innerHTML = playing ? ICONS.pause : ICONS.play;
    this.qs("playpause").dataset.tooltip = playing ? this.strings.pause : this.strings.play;
    this.qs("audio").innerHTML = this.sourceVideo.muted || this.sourceVideo.volume === 0 ? ICONS.muted : ICONS.audio;
    this.qs("audio").dataset.tooltip =
      this.sourceVideo.muted || this.sourceVideo.volume === 0 ? this.strings.unmute : this.strings.mute;
    this.qs("timestamp").textContent = formatTimestamp(
      this.sourceVideo.currentTime,
      this.sourceVideo.duration
    );
    if (!isLiveStream(this.sourceVideo)) {
      this.qs("scrubber").value = String(
        Math.round(progressRatio(this.sourceVideo.currentTime, this.sourceVideo.duration) * 1000)
      );
    }
    this.qs("audio-scrubber").value = String(this.sourceVideo.muted ? 0 : this.sourceVideo.volume);
    const speedRadio = this.pipWindow.document.querySelector(
      `input[name="speed"][value="${this.sourceVideo.playbackRate}"]`
    );
    if (speedRadio) {
      speedRadio.checked = true;
    }
    const live = isLiveStream(this.sourceVideo);
    this.qs("seekBackward").disabled = live;
    this.qs("seekForward").disabled = live;
    this.qs("scrubber").disabled = live;
    if (!playing) {
      this.revealControls(true);
    }
    this.updateCaptions();
  }

  revealControls(keep) {
    const controls = this.qs("controls");
    if (!controls) {
      return;
    }
    controls.setAttribute("showing", "");
    this.showControls();
    if (this.hideTimer) {
      this.openerWindow.clearTimeout(this.hideTimer);
    }
    if (!keep) {
      this.hideTimer = this.openerWindow.setTimeout(() => {
        controls.removeAttribute("showing");
        if (!controls.hasAttribute("keying") && !controls.hasAttribute("donthide")) {
          this.hideControls();
        }
      }, 3000);
    }
  }

  showControls() {
    const controls = this.qs("controls");
    controls?.setAttribute("showing", "");
  }

  hideControls() {
    const controls = this.qs("controls");
    if (this.sourceVideo.paused) {
      return;
    }
    controls?.removeAttribute("showing");
  }

  stopStream() {
    if (!this.stream) {
      return;
    }
    for (const track of this.stream.getTracks()) {
      track.stop();
    }
    this.stream = null;
  }

  close({ pause = false, reason = "close" } = {}) {
    this._pendingPause = pause;
    if (this.usingNative && document.pictureInPictureElement) {
      document.exitPictureInPicture?.();
    }
    if (this.pipWindow && !this.pipWindow.closed) {
      this.pipWindow.close();
    }
    this.teardown({ pause, reason });
  }

  teardown({ pause = false } = {}) {
    if (this._tornDown) {
      return;
    }
    this._tornDown = true;
    for (const unbind of this.bound) {
      unbind();
    }
    this.bound = [];
    this.unbindSource();
    if (this.captionTimer) {
      this.openerWindow.clearInterval(this.captionTimer);
    }
    if (this.hideTimer) {
      this.openerWindow.clearTimeout(this.hideTimer);
    }
    if (this.resizeSnapTimer) {
      this.openerWindow.clearTimeout(this.resizeSnapTimer);
      this.resizeSnapTimer = 0;
    }
    this.stopStream();
    if (pause) {
      this.sourceVideo.pause();
    }
    this.onClose?.({ pause });
  }
}
