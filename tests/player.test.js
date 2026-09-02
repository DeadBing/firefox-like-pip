import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PipPlayer } from "../pip/player.js";

describe("PipPlayer.open", () => {
  it("keeps the user gesture for native PiP when captureStream fails", async () => {
    const calls = [];
    const previousWindow = globalThis.window;
    globalThis.window = {
      documentPictureInPicture: {
        window: null,
        requestWindow() {
          calls.push("document");
        },
      },
    };
    const sourceVideo = {
      captureStream() {
        calls.push("capture");
        throw new DOMException("blocked", "SecurityError");
      },
      async requestPictureInPicture() {
        calls.push("native");
      },
      addEventListener() {},
      removeEventListener() {},
    };

    try {
      const player = new PipPlayer({ sourceVideo, settings: {}, openerWindow: window });
      assert.deepEqual(await player.open(), { mode: "video" });
      assert.deepEqual(calls, ["capture", "native"]);
    } finally {
      if (previousWindow === undefined) {
        delete globalThis.window;
      } else {
        globalThis.window = previousWindow;
      }
    }
  });

  it("rebinds the PiP video when the captured stream gets a track later", () => {
    const assigned = [];
    const listeners = [];
    const stream = {
      getVideoTracks: () => [],
      addEventListener: (type, handler) => listeners.push({ type, handler }),
      removeEventListener: () => {},
    };
    const pipVideo = {
      set srcObject(value) {
        assigned.push(value);
      },
      get srcObject() {
        return assigned.at(-1) ?? null;
      },
      muted: false,
      play: async () => {},
    };
    const player = new PipPlayer({
      sourceVideo: { captureStream: () => stream },
      settings: {},
      openerWindow: { setTimeout() {}, clearTimeout() {} },
    });
    player.stream = stream;
    player.attachPipMedia(pipVideo);
    assert.equal(assigned.length, 1);
    listeners.find((item) => item.type === "addtrack").handler({ track: { kind: "video" } });
    assert.equal(assigned.length, 2);
    assert.equal(assigned[1], stream);
  });

  it("grows a clamped Document PiP window to the video aspect", () => {
    const resized = [];
    const pipWindow = {
      closed: false,
      innerWidth: 240,
      innerHeight: 270,
      outerWidth: 240,
      outerHeight: 306,
      resizeTo(width, height) {
        resized.push({ width, height });
        this.outerWidth = width;
        this.outerHeight = height;
        this.innerWidth = width;
        this.innerHeight = height - 36;
      },
      setTimeout(fn) {
        fn();
      },
    };
    const player = new PipPlayer({
      sourceVideo: { videoWidth: 1080, videoHeight: 1920 },
      settings: {},
      openerWindow: { setTimeout() {}, clearTimeout() {} },
    });
    player.pipWindow = pipWindow;
    player.stream = { getVideoTracks: () => [] };
    assert.equal(player.fitPipWindow({ mode: "grow" }), true);
    assert.deepEqual(resized, [{ width: 240, height: 463 }]);
  });
});
