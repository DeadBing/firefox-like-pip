import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  HIGH_QUALITY_BITRATE,
  HIGH_QUALITY_ENCODING,
  addHighQualityVideoTrack,
  preferHighQualityCodecs,
  preserveConnectionQuality,
  preserveVideoQuality,
  RemoteVideo,
  snapshotVideo,
} from "../lib/remote-video.js";

it("preserves source resolution in the WebRTC bridge", async () => {
  const constraints = [];
  const track = {
    applyConstraints: async (next) => {
      constraints.push(next);
    },
  };
  let applied;
  const sender = {
    getParameters: () => ({ encodings: [] }),
    setParameters: async (parameters) => {
      applied = parameters;
    },
  };

  await preserveVideoQuality(track, sender, { videoWidth: 1920, videoHeight: 1080 });

  assert.equal(track.contentHint, "detail");
  assert.equal(applied.degradationPreference, "maintain-resolution");
  assert.deepEqual(applied.encodings, [{ ...HIGH_QUALITY_ENCODING }]);
  assert.deepEqual(constraints[0].width, { ideal: 1920 });
  assert.deepEqual(constraints[0].frameRate, { ideal: 60 });
});

it("adds the video track with full-res sendEncodings", () => {
  const track = { kind: "video" };
  const stream = {};
  let init;
  const connection = {
    addTransceiver(nextTrack, options) {
      init = { track: nextTrack, options };
      return { sender: { track: nextTrack } };
    },
  };
  addHighQualityVideoTrack(connection, track, stream);
  assert.equal(init.track, track);
  assert.equal(init.options.direction, "sendonly");
  assert.deepEqual(init.options.sendEncodings, [{ ...HIGH_QUALITY_ENCODING }]);
});

it("falls back to addTrack when addTransceiver rejects encodings", () => {
  const track = { kind: "video" };
  const stream = {};
  const added = [];
  const connection = {
    addTransceiver() {
      throw new Error("sendEncodings unsupported");
    },
    addTrack(nextTrack, nextStream) {
      added.push(nextTrack, nextStream);
      return { track: nextTrack };
    },
  };
  addHighQualityVideoTrack(connection, track, stream);
  assert.deepEqual(added, [track, stream]);
});

it("prefers VP9 over VP8 for the iframe bridge", () => {
  const applied = [];
  const connection = {
    getTransceivers: () => [
      {
        sender: { track: { kind: "video" } },
        setCodecPreferences: (codecs) => applied.push(codecs.map((item) => item.mimeType)),
      },
    ],
  };
  const previous = globalThis.RTCRtpSender;
  globalThis.RTCRtpSender = {
    getCapabilities: () => ({
      codecs: [
        { mimeType: "video/VP8" },
        { mimeType: "video/rtx" },
        { mimeType: "video/H264" },
        { mimeType: "video/VP9" },
      ],
    }),
  };
  try {
    preferHighQualityCodecs(connection);
    assert.deepEqual(applied[0], ["video/VP9", "video/H264", "video/VP8", "video/rtx"]);
  } finally {
    if (previous === undefined) {
      delete globalThis.RTCRtpSender;
    } else {
      globalThis.RTCRtpSender = previous;
    }
  }
});

it("re-applies sender parameters after negotiation", async () => {
  const calls = [];
  const track = { kind: "video" };
  const connection = {
    getTransceivers: () => [],
    getSenders: () => [
      {
        track,
        getParameters: () => ({ encodings: [{ scaleResolutionDownBy: 2, maxBitrate: 300_000 }] }),
        setParameters: async (parameters) => {
          calls.push(parameters.encodings[0]);
        },
      },
    ],
  };
  await preserveConnectionQuality(connection, { videoWidth: 1280, videoHeight: 720 });
  assert.equal(calls[0].scaleResolutionDownBy, 1);
  assert.equal(calls[0].maxBitrate, HIGH_QUALITY_BITRATE);
});

describe("RemoteVideo", () => {
  it("mirrors state and forwards player commands", async () => {
    const commands = [];
    const stream = {};
    const remote = new RemoteVideo(
      stream,
      snapshotVideo({
        paused: true,
        ended: false,
        currentTime: 12,
        duration: 60,
        volume: 0.5,
        muted: false,
        playbackRate: 1,
        readyState: 4,
        videoWidth: 1280,
        videoHeight: 720,
      }),
      (command) => commands.push(command)
    );

    assert.equal(remote.captureStream(), stream);
    await remote.play();
    remote.currentTime = 20;
    remote.volume = 0.8;
    remote.muted = true;
    remote.playbackRate = 1.5;
    remote.pause();

    assert.deepEqual(commands, [
      { name: "play", value: undefined },
      { name: "currentTime", value: 20 },
      { name: "volume", value: 0.8 },
      { name: "muted", value: true },
      { name: "playbackRate", value: 1.5 },
      { name: "pause", value: undefined },
    ]);
  });
});
