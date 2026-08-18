import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { uniqueCatalog, catalogGroups, memberHint, FOLDER_TYPES } from "../extension/lib/metadataTypes.js";

describe("configurator catalog", () => {
  it("puts fields and flows in configuration, apex in code", () => {
    const config = uniqueCatalog("config").map((t) => t.name);
    const code = uniqueCatalog("code").map((t) => t.name);
    assert.equal(config.includes("CustomField"), true);
    assert.equal(config.includes("Flow"), true);
    assert.equal(config.includes("PermissionSet"), true);
    assert.equal(config.includes("ApexClass"), false);
    assert.equal(code.includes("ApexClass"), true);
    assert.equal(code.includes("CustomField"), false);
  });

  it("groups configuration types for the picker", () => {
    const groups = catalogGroups("config");
    assert.equal(groups[0].id, "objects");
    assert.equal(groups.some((g) => g.id === "code"), false);
    assert.equal(memberHint("CustomField"), "Account.Customer_Status__c");
    assert.equal(FOLDER_TYPES.Report, "ReportFolder");
  });
});
