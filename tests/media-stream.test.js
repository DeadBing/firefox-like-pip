import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyTrackResolution,
  attachStreamToVideo,
  capturedSizeLooksDownscaled,
  captureVideoStream,
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

describe("applyTrackResolution", () => {
  it("asks the captured track for the decoded video size", async () => {
    const constraints = [];
    const track = {
      applyConstraints: async (next) => {
        constraints.push(next);
      },
    };
    await applyTrackResolution(track, { videoWidth: 1920, videoHeight: 800 });
    assert.equal(track.contentHint, "detail");
    assert.deepEqual(constraints[0].height, { ideal: 800 });
  });
});

describe("capturedSizeLooksDownscaled", () => {
  it("is true when the track is much smaller than the decoded frames", () => {
    assert.equal(
      capturedSizeLooksDownscaled(
        { videoWidth: 1280, videoHeight: 720, clientWidth: 880, clientHeight: 360 },
        { getSettings: () => ({ width: 880, height: 360 }) }
      ),
      true
    );
    assert.equal(
      capturedSizeLooksDownscaled(
        { videoWidth: 1280, videoHeight: 720, clientWidth: 1280, clientHeight: 720 },
        { getSettings: () => ({ width: 1280, height: 720 }) }
      ),
      false
    );
  });
});

describe("captureVideoStream", () => {
  it("uses the element capture when a video track exists", () => {
    const stream = {
      getVideoTracks: () => [{ readyState: "live", kind: "video", getSettings: () => ({ width: 1280, height: 720 }) }],
      getTracks: () => [],
    };
    assert.deepEqual(
      captureVideoStream({
        tagName: "VIDEO",
        videoWidth: 1280,
        videoHeight: 720,
        clientWidth: 1280,
        clientHeight: 720,
        captureStream: () => stream,
      }),
      {
        stream,
        mode: "element",
      }
    );
  });

  it("paints a full-res canvas when captureStream matches a small on-page box", () => {
    const stopped = [];
    const stream = {
      getVideoTracks: () => [{ readyState: "live", kind: "video", getSettings: () => ({ width: 640, height: 360 }) }],
      getTracks: () => [{ stop: () => stopped.push("stop") }],
    };
    const frames = [];
    const context = {
      drawImage: (...args) => frames.push(args),
      getImageData: () => ({ data: [1, 2, 3, 4] }),
    };
    const previous = globalThis.document;
    globalThis.document = {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => context,
        captureStream: () => ({
          getTracks: () => [{ stop() {} }],
        }),
      }),
    };
    globalThis.requestAnimationFrame = (fn) => {
      fn();
      return 1;
    };
    try {
      const result = captureVideoStream({
        tagName: "VIDEO",
        videoWidth: 1920,
        videoHeight: 1080,
        clientWidth: 640,
        clientHeight: 360,
        readyState: 4,
        currentSrc: "blob:https://site.example/1",
        captureStream: () => stream,
      });
      assert.equal(result.mode, "canvas");
      assert.deepEqual(stopped, ["stop"]);
      assert.equal(frames.length > 0, true);
    } finally {
      if (previous === undefined) {
        delete globalThis.document;
      } else {
        globalThis.document = previous;
      }
    }
  });

  it("throws TAINTED when capture is blocked and paint is tainted", () => {
    const previous = globalThis.location;
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: { href: "https://site.example/", origin: "https://site.example" },
    });
    try {
      assert.throws(
        () =>
          captureVideoStream({
            currentSrc: "https://cdn.example/a.mp4",
            crossOrigin: null,
            captureStream() {
              throw new Error("blocked");
            },
          }),
        (error) => error.code === "TAINTED"
      );
    } finally {
      Object.defineProperty(globalThis, "location", { configurable: true, value: previous });
    }
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
