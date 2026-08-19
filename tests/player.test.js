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
});
