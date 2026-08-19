import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MIN_VIDEO_DIMENSION,
  pickBestVideo,
  scoreVideo,
  shouldShowPictureInPictureToggle,
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
