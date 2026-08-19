import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SEEK_TIME_SECS,
  applyKeystroke,
  buildKeystroke,
  handlePlayerKey,
  isToggleShortcut,
} from "../lib/keys.js";

function videoStub(overrides = {}) {
  return {
    paused: false,
    ended: false,
    muted: false,
    volume: 0.5,
    currentTime: 20,
    duration: 100,
    play() {
      this.paused = false;
    },
    pause() {
      this.paused = true;
    },
    ...overrides,
  };
}

describe("buildKeystroke", () => {
  it("uses Ctrl as accel on Windows", () => {
    assert.equal(
      buildKeystroke({ ctrlKey: true, key: "ArrowUp", platform: "Win32" }),
      "accel-upArrow"
    );
  });

  it("uses Meta as accel on macOS", () => {
    assert.equal(
      buildKeystroke({ metaKey: true, key: "w", platform: "MacIntel" }),
      "accel-w"
    );
  });
});

describe("applyKeystroke", () => {
  it("toggles playback and seeks like Firefox", () => {
    const video = videoStub();
    assert.equal(applyKeystroke(video, "space").action, "pause");
    assert.equal(video.paused, true);
    assert.equal(applyKeystroke(video, "leftArrow").currentTime, 15);
    assert.equal(SEEK_TIME_SECS, 5);
    applyKeystroke(video, "accel-rightArrow");
    assert.equal(video.currentTime, 25);
  });

  it("changes volume in tenths and mutes at zero", () => {
    const video = videoStub({ volume: 0.15 });
    applyKeystroke(video, "downArrow");
    assert.equal(video.volume, 0.05);
    applyKeystroke(video, "downArrow");
    assert.equal(video.volume, 0);
    assert.equal(video.muted, true);
  });

  it("closes without pausing on Shift+Esc", () => {
    const video = videoStub();
    const result = applyKeystroke(video, "shift-escape");
    assert.deepEqual(result, { action: "close", pause: false });
    assert.equal(video.paused, false);
  });

  it("skips seeking on live video", () => {
    const video = videoStub({ currentTime: 8 });
    assert.equal(applyKeystroke(video, "leftArrow", { isLive: true }).action, "none");
    assert.equal(video.currentTime, 8);
  });
});

describe("page shortcut", () => {
  it("matches Firefox Ctrl+Shift+] and the macOS variant", () => {
    assert.equal(
      isToggleShortcut({ code: "BracketRight", key: "]", ctrlKey: true, shiftKey: true }, "Win32"),
      true
    );
    assert.equal(
      isToggleShortcut(
        { code: "BracketRight", key: "]", metaKey: true, shiftKey: true, altKey: true },
        "MacIntel"
      ),
      true
    );
  });
});

describe("handlePlayerKey", () => {
  it("maps Space to play/pause", () => {
    const video = videoStub({ paused: true });
    const result = handlePlayerKey(video, { key: " ", altKey: false, shiftKey: false, metaKey: false, ctrlKey: false });
    assert.equal(result.action, "play");
  });
});
