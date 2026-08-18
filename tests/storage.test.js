import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mergeSettings, isGithubConfigured, repoLabel, DEFAULT_METADATA_TYPES } from "../extension/lib/storage.js";

describe("settings", () => {
  it("fills defaults and keeps a connected repo", () => {
    const merged = mergeSettings({
      github: { token: "ghp_x", owner: "acme", repo: "sf" }
    });
    assert.equal(merged.github.branch, "main");
    assert.equal(merged.apiVersion, "61.0");
    assert.deepEqual(merged.metadataTypes, DEFAULT_METADATA_TYPES);
    assert.equal(isGithubConfigured(merged), true);
    assert.equal(repoLabel(merged), "acme/sf@main");
  });

  it("keeps an empty component package", () => {
    const merged = mergeSettings({ packageTypes: [] });
    assert.deepEqual(merged.packageTypes, []);
  });

  it("treats a missing repo as disconnected", () => {
    assert.equal(isGithubConfigured(mergeSettings({})), false);
    assert.equal(repoLabel(mergeSettings({})), "No repo connected");
  });
});
