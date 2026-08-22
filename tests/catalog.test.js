import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  uniqueCatalog,
  catalogGroupsFromTypes,
  memberHint,
  FOLDER_TYPES,
  fallbackTypeRecords,
  searchTypes,
  mergeDescribedTypes,
  ALL_METADATA_TYPES
} from "../extension/lib/metadataTypes.js";
import { parseDescribeMetadata } from "../extension/lib/packageXml.js";

describe("configurator catalog", () => {
  it("includes the full Metadata API type list", () => {
    assert.ok(ALL_METADATA_TYPES.length > 500);
    const names = fallbackTypeRecords().map((t) => t.name);
    for (const required of ["CustomField", "Flow", "PermissionSet", "ApexClass", "ExperienceBundle", "FlexiPage"]) {
      assert.equal(names.includes(required), true, required);
    }
  });

  it("puts everyday config types first and still finds apex via search", () => {
    const config = uniqueCatalog("config").map((t) => t.name);
    assert.equal(config.includes("CustomField"), true);
    assert.equal(config.includes("Flow"), true);
    assert.equal(config.includes("ApexClass"), false);
    const hits = searchTypes(fallbackTypeRecords(), "apex");
    assert.ok(hits.some((t) => t.name === "ApexClass"));
    assert.equal(memberHint("CustomField"), "Account.Customer_Status__c");
    assert.equal(FOLDER_TYPES.Report, "ReportFolder");
  });

  it("groups common types above the rest", () => {
    const groups = catalogGroupsFromTypes(fallbackTypeRecords(), "");
    assert.equal(groups[0].id, "common");
    assert.equal(groups[0].types[0].name, "CustomField");
    assert.equal(groups[1].id, "all");
  });

  it("merges describeMetadata child types", () => {
    const xml = `<describeMetadataResponse>
      <result>
        <metadataObjects>
          <xmlName>CustomObject</xmlName>
          <inFolder>false</inFolder>
          <childXmlNames>CustomField</childXmlNames>
          <childXmlNames>ValidationRule</childXmlNames>
        </metadataObjects>
        <metadataObjects>
          <xmlName>EmailTemplate</xmlName>
          <inFolder>true</inFolder>
        </metadataObjects>
      </result>
    </describeMetadataResponse>`;
    const described = parseDescribeMetadata(xml);
    assert.equal(described[0].xmlName, "CustomObject");
    assert.deepEqual(described[0].children, ["CustomField", "ValidationRule"]);
    const merged = mergeDescribedTypes(described);
    const email = merged.find((t) => t.name === "EmailTemplate");
    assert.equal(email.inFolder, true);
    assert.equal(email.folderType, "EmailFolder");
  });
});
