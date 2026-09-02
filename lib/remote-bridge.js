/** Same-tab iframe ↔ top-frame. STUN helps when host/mDNS candidates do not pair. */
export const RTC_CONFIG = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export function iceCandidatePayload(candidate) {
  if (!candidate) {
    return { candidate: null };
  }
  return {
    candidate:
      candidate.toJSON?.() ?? {
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid,
        sdpMLineIndex: candidate.sdpMLineIndex,
      },
  };
}

export function createIceBucket() {
  const pending = new Map();
  return {
    queue(sessionId, candidate) {
      const list = pending.get(sessionId) ?? [];
      list.push(candidate);
      pending.set(sessionId, list);
    },
    take(sessionId) {
      const list = pending.get(sessionId) ?? [];
      pending.delete(sessionId);
      return list;
    },
  };
}

export async function applyIceCandidate(connection, candidate) {
  if (!connection?.addIceCandidate) {
    return;
  }
  try {
    await connection.addIceCandidate(candidate ?? null);
  } catch {
    /* Duplicate or stale candidate */
  }
}

export async function flushIceBucket(bucket, sessionId, connection) {
  for (const candidate of bucket.take(sessionId)) {
    await applyIceCandidate(connection, candidate);
  }
}

/** Paint the reserved Document PiP document immediately so it is not a white about:blank. */
export function paintPipShell(pipWindow) {
  const doc = pipWindow?.document;
  if (!doc) {
    return;
  }
  const html = doc.documentElement;
  if (html) {
    html.style.background = "#000";
    html.style.height = "100%";
  }
  if (doc.body) {
    doc.body.style.background = "#000";
    doc.body.style.margin = "0";
    doc.body.style.height = "100%";
  }
}

/**
 * Apply the iframe offer and create an answer.
 * Must not wait for ontrack: Chrome often withholds the track until the
 * answer is applied on the sender, so waiting first deadlocks and the
 * empty white PiP window is then closed.
 */
export async function createReceiverAnswer(connection, offer) {
  await connection.setRemoteDescription(offer);
  await connection.setLocalDescription(await connection.createAnswer());
  const local = connection.localDescription;
  if (!local) {
    throw new Error("The top frame could not create a WebRTC answer");
  }
  return local.toJSON?.() ?? { type: local.type, sdp: local.sdp };
}

export function shouldCloseOnIceFailure(previousState, nextState) {
  return previousState === "connected" && nextState === "failed";
}

/** HLS/MSE players fire emptied on quality switches; only close if the element is gone. */
export function sourceWasRemoved(video) {
  return Boolean(video) && video.isConnected === false;
}
