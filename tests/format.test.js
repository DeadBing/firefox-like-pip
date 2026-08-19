import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clamp, formatClock, formatTimestamp, progressRatio } from "../lib/format.js";

describe("formatClock", () => {
  it("formats minutes and seconds", () => {
    assert.equal(formatClock(0), "0:00");
    assert.equal(formatClock(9), "0:09");
    assert.equal(formatClock(65), "1:05");
  });

  it("formats hours", () => {
    assert.equal(formatClock(3661), "1:01:01");
  });

  it("guards invalid values", () => {
    assert.equal(formatClock(-3), "0:00");
    assert.equal(formatClock(Number.NaN), "0:00");
    assert.equal(formatClock(Number.POSITIVE_INFINITY), "0:00");
  });
});

describe("formatTimestamp", () => {
  it("joins current time and duration", () => {
    assert.equal(formatTimestamp(5, 90), "0:05 / 1:30");
  });

  it("marks live streams", () => {
    assert.equal(formatTimestamp(12, Number.POSITIVE_INFINITY), "0:12 / LIVE");
  });
});

describe("progress helpers", () => {
  it("clamps and computes a ratio", () => {
    assert.equal(clamp(2, 0, 1), 1);
    assert.equal(progressRatio(30, 120), 0.25);
    assert.equal(progressRatio(10, 0), 0);
  });
});
