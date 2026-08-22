import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_API_VERSION, normalizeApiVersion, apiVersionLabel, METADATA_API_VERSIONS } from "../extension/lib/apiVersion.js";
import { mergeSettings } from "../extension/lib/storage.js";

describe("Salesforce API version", () => {
  it("defaults to 67.0 and keeps a valid stored version", () => {
    assert.equal(DEFAULT_API_VERSION, "67.0");
    assert.equal(normalizeApiVersion(""), "67.0");
    assert.equal(normalizeApiVersion("67"), "67.0");
    assert.equal(normalizeApiVersion("61.0"), "61.0");
    assert.equal(normalizeApiVersion("99.0"), "67.0");
    assert.equal(normalizeApiVersion("nope"), "67.0");
    assert.equal(apiVersionLabel("67.0"), "67.0 · Summer '26");
    assert.equal(METADATA_API_VERSIONS[0].version, "67.0");
  });

  it("stores the chosen API version in settings", () => {
    assert.equal(mergeSettings({}).apiVersion, "67.0");
    assert.equal(mergeSettings({ apiVersion: "61.0" }).apiVersion, "61.0");
    assert.equal(mergeSettings({ apiVersion: "66" }).apiVersion, "66.0");
  });
});
