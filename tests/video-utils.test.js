import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MIN_VIDEO_DIMENSION,
  PIP_MAX_EDGE,
  aspectMismatch,
  growInnerToAspect,
  outerSizeForInner,
  pickBestVideo,
  pipRequestOptions,
  pipWindowSize,
  scoreVideo,
  shouldShowPictureInPictureToggle,
  snapInnerToAspect,
  videoContentSize,
  visibleArea,
} from "../lib/video-utils.js";
import { mergeSettings } from "../lib/settings.js";
import { captionFontScale, isCaptionTrack, showingCaptionText } from "../lib/captions.js";

const settings = mergeSettings({});

describe("shouldShowPictureInPictureToggle", () => {
  it("hides short or tiny videos unless always-show is on", () => {
    const short = { duration: 20, disablePictureInPicture: false, clientWidth: 400, clientHeight: 300 };
    assert.equal(shouldShowPictureInPictureToggle(short, settings), false);
    assert.equal(
      shouldShowPictureInPictureToggle(short, mergeSettings({ alwaysShowToggle: true })),
      true
    );
    const tiny = { duration: 120, clientWidth: 80, clientHeight: 80 };
    assert.equal(
      shouldShowPictureInPictureToggle(tiny, settings, { videoWidth: 80, videoHeight: 80 }),
      false
    );
  });

  it("respects disablePictureInPicture when configured", () => {
    const video = {
      duration: 200,
      disablePictureInPicture: true,
      clientWidth: 400,
      clientHeight: 300,
    };
    assert.equal(shouldShowPictureInPictureToggle(video, settings), false);
    assert.equal(
      shouldShowPictureInPictureToggle(
        video,
        mergeSettings({ respectDisablePictureInPicture: false })
      ),
      true
    );
  });

  it("shows a long enough video", () => {
    const video = { duration: 46, clientWidth: MIN_VIDEO_DIMENSION, clientHeight: MIN_VIDEO_DIMENSION };
    assert.equal(shouldShowPictureInPictureToggle(video, settings), true);
  });
});

describe("pickBestVideo", () => {
  it("prefers a playing video over a larger paused one", () => {
    const paused = {
      paused: true,
      ended: false,
      readyState: 4,
      getBoundingClientRect: () => ({ left: 0, top: 0, right: 800, bottom: 450, width: 800, height: 450 }),
    };
    const playing = {
      paused: false,
      ended: false,
      readyState: 4,
      getBoundingClientRect: () => ({ left: 0, top: 0, right: 320, bottom: 180, width: 320, height: 180 }),
    };
    assert.equal(pickBestVideo([paused, playing], { width: 1000, height: 800 }), playing);
    assert.ok(scoreVideo(playing, { width: 1000, height: 800 }) > scoreVideo(paused, { width: 1000, height: 800 }));
  });
});

describe("visibleArea", () => {
  it("clips to the viewport", () => {
    assert.equal(visibleArea({ left: -10, top: -10, right: 10, bottom: 10 }, 100, 100), 100);
  });
});

describe("pipWindowSize", () => {
  it("keeps 16:9 landscape inside the max edge", () => {
    assert.deepEqual(pipWindowSize({ videoWidth: 1920, videoHeight: 1080 }), {
      width: PIP_MAX_EDGE,
      height: Math.round(PIP_MAX_EDGE / (16 / 9)),
    });
  });

  it("does not crush 9:16 portrait into a 16:9 hole", () => {
    const size = pipWindowSize({ videoWidth: 1080, videoHeight: 1920 });
    assert.equal(size.height, PIP_MAX_EDGE);
    assert.equal(size.width, Math.round(PIP_MAX_EDGE * (9 / 16)));
    assert.equal(aspectMismatch(size.width, size.height, 9 / 16), false);
  });

  it("preserves 4:3 and 21:9", () => {
    const standard = pipWindowSize({ videoWidth: 800, videoHeight: 600 });
    assert.deepEqual(standard, { width: PIP_MAX_EDGE, height: Math.round(PIP_MAX_EDGE / (4 / 3)) });
    const ultra = pipWindowSize({ videoWidth: 2560, videoHeight: 1080 });
    assert.equal(aspectMismatch(ultra.width, ultra.height, 2560 / 1080), false);
    assert.equal(ultra.width, PIP_MAX_EDGE);
  });

  it("prefers captured track settings over the element box", () => {
    const size = videoContentSize(
      { videoWidth: 1920, videoHeight: 1080, clientWidth: 400, clientHeight: 400 },
      {
        getVideoTracks: () => [
          {
            getSettings: () => ({ width: 720, height: 1280 }),
          },
        ],
      }
    );
    assert.deepEqual({ width: size.width, height: size.height }, { width: 720, height: 1280 });
  });

  it("asks Chrome for a fresh window of that size", () => {
    const options = pipRequestOptions({ videoWidth: 1080, videoHeight: 1920 });
    assert.equal(options.preferInitialWindowPlacement, true);
    assert.equal(options.height, PIP_MAX_EDGE);
    assert.equal(options.width, Math.round(PIP_MAX_EDGE * (9 / 16)));
  });
});

describe("window aspect helpers", () => {
  it("grows the short side after Chrome clamps a portrait window", () => {
    assert.deepEqual(growInnerToAspect(240, 270, 9 / 16), { width: 240, height: 427 });
  });

  it("adds window chrome onto the inner video size", () => {
    assert.deepEqual(
      outerSizeForInner({ innerWidth: 480, innerHeight: 270, outerWidth: 480, outerHeight: 306 }, 480, 270),
      { width: 480, height: 306 }
    );
  });

  it("snaps to the edge the user dragged", () => {
    assert.deepEqual(
      snapInnerToAspect(600, 400, 16 / 9, { width: 480, height: 400 }),
      { width: 600, height: 338 }
    );
    assert.deepEqual(
      snapInnerToAspect(480, 400, 16 / 9, { width: 480, height: 270 }),
      { width: 711, height: 400 }
    );
  });
});

describe("captions helpers", () => {
  it("reads showing cues and font scale", () => {
    assert.equal(isCaptionTrack({ kind: "captions" }), true);
    assert.equal(isCaptionTrack({ kind: "chapters" }), false);
    assert.equal(captionFontScale("large"), 1.35);
    const video = {
      textTracks: [
        {
          kind: "captions",
          mode: "showing",
          activeCues: [{ text: "Hello" }, { text: "world" }],
        },
      ],
    };
    assert.equal(showingCaptionText(video), "Hello\nworld");
  });
});
