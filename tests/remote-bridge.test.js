import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { adoptIncomingTrack } from "../lib/media-stream.js";
import {
  applyIceCandidate,
  createIceBucket,
  createReceiverAnswer,
  flushIceBucket,
  iceCandidatePayload,
  paintPipShell,
  shouldCloseOnIceFailure,
  sourceWasRemoved,
} from "../lib/remote-bridge.js";

describe("createReceiverAnswer", () => {
  it("returns the answer without waiting for ontrack", async () => {
    const order = [];
    const connection = {
      async setRemoteDescription(offer) {
        order.push(`offer:${offer.sdp}`);
      },
      async createAnswer() {
        order.push("createAnswer");
        return { type: "answer", sdp: "v=0" };
      },
      async setLocalDescription(answer) {
        order.push(`local:${answer.sdp}`);
        this.localDescription = {
          type: answer.type,
          sdp: answer.sdp,
          toJSON() {
            return { type: this.type, sdp: this.sdp };
          },
        };
      },
      localDescription: null,
    };

    const answer = await createReceiverAnswer(connection, { type: "offer", sdp: "offer-sdp" });
    assert.deepEqual(answer, { type: "answer", sdp: "v=0" });
    assert.deepEqual(order, ["offer:offer-sdp", "createAnswer", "local:v=0"]);
  });

  it("unblocks a sender that only fires ontrack after the answer is applied", async () => {
    let applyAnswer;
    const answerApplied = new Promise((resolve) => {
      applyAnswer = resolve;
    });
    let trackReady;
    const trackArrived = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("deadlocked waiting for track")), 50);
      trackReady = () => {
        clearTimeout(timer);
        resolve();
      };
    });

    const connection = {
      async setRemoteDescription() {},
      async createAnswer() {
        return { type: "answer", sdp: "v=0" };
      },
      async setLocalDescription() {
        this.localDescription = {
          type: "answer",
          sdp: "v=0",
          toJSON: () => ({ type: "answer", sdp: "v=0" }),
        };
      },
      localDescription: null,
    };

    const answer = await createReceiverAnswer(connection, { type: "offer", sdp: "o" });
    applyAnswer(answer);
    await answerApplied;
    trackReady();
    await trackArrived;
    assert.equal(answer.type, "answer");
  });
});

describe("adoptIncomingTrack", () => {
  it("copies tracks from event.streams as well as event.track", () => {
    const added = [];
    const stream = {
      addTrack: (track) => added.push(track),
      getTracks: () => added,
      getVideoTracks: () => added.filter((track) => track.kind === "video"),
    };
    const video = { kind: "video", readyState: "live" };
    const audio = { kind: "audio", readyState: "live" };
    adoptIncomingTrack(stream, {
      track: video,
      streams: [{ getTracks: () => [audio, video] }],
    });
    assert.deepEqual(added, [audio, video]);
  });
});

describe("shouldCloseOnIceFailure", () => {
  it("ignores failed before the first connected state", () => {
    assert.equal(shouldCloseOnIceFailure("new", "failed"), false);
    assert.equal(shouldCloseOnIceFailure("checking", "failed"), false);
    assert.equal(shouldCloseOnIceFailure("connected", "failed"), true);
  });
});

describe("sourceWasRemoved", () => {
  it("is false while the element is still in the document", () => {
    assert.equal(sourceWasRemoved({ isConnected: true }), false);
    assert.equal(sourceWasRemoved({}), false);
    assert.equal(sourceWasRemoved({ isConnected: false }), true);
  });
});

describe("ICE trickle helpers", () => {
  it("queues candidates until the peer connection exists", async () => {
    const bucket = createIceBucket();
    bucket.queue("s1", { candidate: "a" });
    bucket.queue("s1", null);
    const applied = [];
    const connection = {
      addIceCandidate: async (candidate) => {
        applied.push(candidate);
      },
    };
    await flushIceBucket(bucket, "s1", connection);
    assert.deepEqual(applied, [{ candidate: "a" }, null]);
    assert.deepEqual(bucket.take("s1"), []);
  });

  it("serializes an RTCIceCandidate", () => {
    assert.deepEqual(iceCandidatePayload(null), { candidate: null });
    assert.deepEqual(
      iceCandidatePayload({
        toJSON: () => ({ candidate: "typ host", sdpMid: "0", sdpMLineIndex: 0 }),
      }),
      { candidate: { candidate: "typ host", sdpMid: "0", sdpMLineIndex: 0 } }
    );
  });

  it("swallows addIceCandidate failures", async () => {
    await applyIceCandidate(
      {
        addIceCandidate: async () => {
          throw new Error("bad");
        },
      },
      { candidate: "x" }
    );
  });
});

describe("paintPipShell", () => {
  it("paints the reserved window black", () => {
    const doc = {
      documentElement: { style: {} },
      body: { style: {} },
    };
    paintPipShell({ document: doc });
    assert.equal(doc.documentElement.style.background, "#000");
    assert.equal(doc.body.style.background, "#000");
  });
});
