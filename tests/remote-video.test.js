import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  preserveVideoQuality,
  RemoteVideo,
  snapshotVideo,
} from "../lib/remote-video.js";

it("preserves source resolution in the WebRTC bridge", async () => {
  const track = {};
  let applied;
  const sender = {
    getParameters: () => ({ encodings: [{}] }),
    setParameters: async (parameters) => {
      applied = parameters;
    },
  };

  await preserveVideoQuality(track, sender);

  assert.equal(track.contentHint, "detail");
  assert.equal(applied.degradationPreference, "maintain-resolution");
  assert.deepEqual(applied.encodings, [{
    scaleResolutionDownBy: 1,
    maxBitrate: 20_000_000,
  }]);
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
