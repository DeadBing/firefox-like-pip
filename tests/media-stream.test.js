import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  attachStreamToVideo,
  shouldUseNativeVideoPip,
  streamVideoTrack,
  videoFrameCaptureBlocked,
  waitForVideoTrack,
} from "../lib/media-stream.js";

describe("videoFrameCaptureBlocked", () => {
  const previous = globalThis.location;
  const fakeLocation = { href: "https://site.example/watch", origin: "https://site.example" };

  it("allows MSE blobs and same-origin files", () => {
    Object.defineProperty(globalThis, "location", { configurable: true, value: fakeLocation });
    try {
      assert.equal(videoFrameCaptureBlocked({ currentSrc: "blob:https://site.example/1" }), false);
      assert.equal(
        videoFrameCaptureBlocked({ currentSrc: "https://site.example/a.mp4", crossOrigin: null }),
        false
      );
    } finally {
      Object.defineProperty(globalThis, "location", { configurable: true, value: previous });
    }
  });

  it("blocks a cross-origin file without CORS", () => {
    Object.defineProperty(globalThis, "location", { configurable: true, value: fakeLocation });
    try {
      assert.equal(
        videoFrameCaptureBlocked({ currentSrc: "https://cdn.example/a.mp4", crossOrigin: null }),
        true
      );
      assert.equal(
        videoFrameCaptureBlocked({ currentSrc: "https://cdn.example/a.mp4", crossOrigin: "anonymous" }),
        false
      );
    } finally {
      Object.defineProperty(globalThis, "location", { configurable: true, value: previous });
    }
  });
});

describe("shouldUseNativeVideoPip", () => {
  it("is true when capture is blocked", () => {
    const previous = globalThis.location;
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: { href: "https://site.example/", origin: "https://site.example" },
    });
    try {
      assert.equal(
        shouldUseNativeVideoPip({ currentSrc: "https://other.example/v.mp4", crossOrigin: null }),
        true
      );
    } finally {
      Object.defineProperty(globalThis, "location", { configurable: true, value: previous });
    }
  });
});

describe("waitForVideoTrack", () => {
  it("resolves immediately when a live track exists", async () => {
    const track = { readyState: "live", kind: "video" };
    const stream = { getVideoTracks: () => [track] };
    assert.equal(await waitForVideoTrack(stream), track);
    assert.equal(streamVideoTrack(stream), track);
  });

  it("waits for addtrack", async () => {
    const listeners = [];
    const track = { readyState: "live", kind: "video" };
    const stream = {
      getVideoTracks: () => [],
      addEventListener: (type, handler) => listeners.push({ type, handler }),
      removeEventListener: () => {},
    };
    const pending = waitForVideoTrack(stream, 200);
    listeners.find((item) => item.type === "addtrack").handler({ track });
    assert.equal(await pending, track);
  });
});

describe("attachStreamToVideo", () => {
  it("reassigns srcObject when a video track arrives later", () => {
    const listeners = [];
    const stream = {
      getVideoTracks: () => [],
      addEventListener: (type, handler) => listeners.push({ type, handler }),
      removeEventListener: () => {},
    };
    const assigned = [];
    const video = {
      srcObject: null,
      muted: false,
      play: async () => assigned.push("play"),
    };
    const unbind = attachStreamToVideo(video, stream);
    assert.equal(video.srcObject, stream);
    listeners.find((item) => item.type === "addtrack").handler({ track: { kind: "video" } });
    assert.equal(video.srcObject, stream);
    assert.equal(video.muted, true);
    unbind();
  });
});
