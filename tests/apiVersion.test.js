import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_API_VERSION,
  METADATA_API_VERSIONS,
  apiVersionLabel,
  mergeApiVersionRows,
  newestApiVersion,
  normalizeApiVersion,
  parseOrgApiVersions
} from "../extension/lib/apiVersion.js";
import { mergeSettings } from "../extension/lib/storage.js";

describe("Salesforce API version", () => {
  it("defaults to 67.0 and keeps a valid stored version, including future 68/69", () => {
    assert.equal(DEFAULT_API_VERSION, "67.0");
    assert.equal(normalizeApiVersion(""), "67.0");
    assert.equal(normalizeApiVersion("67"), "67.0");
    assert.equal(normalizeApiVersion("61.0"), "61.0");
    assert.equal(normalizeApiVersion("68.0"), "68.0");
    assert.equal(normalizeApiVersion("69"), "69.0");
    assert.equal(normalizeApiVersion("99.0"), "99.0");
    assert.equal(normalizeApiVersion("200.0"), "67.0");
    assert.equal(normalizeApiVersion("nope"), "67.0");
    assert.equal(apiVersionLabel("67.0"), "67.0 · Summer '26");
    assert.equal(METADATA_API_VERSIONS[0].version, "67.0");
  });

  it("stores the chosen API version in settings", () => {
    assert.equal(mergeSettings({}).apiVersion, "67.0");
    assert.equal(mergeSettings({ apiVersion: "61.0" }).apiVersion, "61.0");
    assert.equal(mergeSettings({ apiVersion: "66" }).apiVersion, "66.0");
    assert.equal(mergeSettings({ apiVersion: "68.0" }).apiVersion, "68.0");
  });

  it("parses Salesforce /services/data/ and keeps newest first", () => {
    const rows = parseOrgApiVersions([
      { label: "Spring '24", url: "/services/data/v61.0", version: "61.0" },
      { label: "Summer '27", url: "/services/data/v68.0", version: "68.0" },
      { label: "Winter '27", url: "/services/data/v69.0", version: "69.0" }
    ]);
    assert.deepEqual(
      rows.map((row) => row.version),
      ["69.0", "68.0", "61.0"]
    );
    assert.equal(rows[0].season, "Winter '27");
    assert.equal(newestApiVersion(rows), "69.0");
    assert.equal(apiVersionLabel("69.0", rows), "69.0 · Winter '27");
  });

  it("merges the fallback list with org-discovered versions", () => {
    const merged = mergeApiVersionRows(METADATA_API_VERSIONS, [
      { version: "68.0", season: "Summer '27" }
    ]);
    assert.equal(merged[0].version, "68.0");
    assert.ok(merged.some((row) => row.version === "67.0"));
  });
});
