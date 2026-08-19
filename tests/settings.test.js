import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, mergeSettings } from "../lib/settings.js";

describe("mergeSettings", () => {
  it("fills defaults and overrides known keys", () => {
    const merged = mergeSettings({ autoPipOnTabSwitch: true, minVideoSecs: 10 });
    assert.equal(merged.toggleEnabled, DEFAULT_SETTINGS.toggleEnabled);
    assert.equal(merged.autoPipOnTabSwitch, true);
    assert.equal(merged.minVideoSecs, 10);
  });

  it("tolerates empty input", () => {
    assert.deepEqual(mergeSettings(null), { ...DEFAULT_SETTINGS });
  });
});
