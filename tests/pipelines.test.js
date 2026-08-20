import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  pipelinesFilePath,
  emptyPipelineStore,
  parsePipelineStore,
  createPipeline,
  upsertPipeline,
  findPipeline,
  matchOrg,
  pipelineId,
  stagesFromPipeline,
  pipelinePathLabel,
  findMatchingPipeline,
  appendStage,
  nextHopAfter
} from "../extension/lib/pipelines.js";
import {
  STANDARD_OBJECTS,
  withStandardObjectMembers,
  objectFilterOptions,
  isStandardObject,
  memberObjectKey
} from "../extension/lib/metadataTypes.js";

describe("pipelines", () => {
  it("stores reusable source → target pipelines", () => {
    const record = createPipeline({
      name: "Sandbox to UAT",
      source: { label: "Dev", username: "a@x.com", instanceUrl: "https://dev.my.salesforce.com", sid: "SECRET" },
      target: { label: "UAT", username: "b@x.com", instanceUrl: "https://uat.my.salesforce.com" },
      testLevel: "NoTestRun",
      useGit: true
    });
    assert.equal(record.name, "Sandbox to UAT");
    assert.equal(record.source.label, "Dev");
    assert.equal(record.source.sid, undefined);
    assert.equal(pipelinesFilePath(), ".orgflow/pipelines.json");
    const store = upsertPipeline(emptyPipelineStore(), record);
    assert.equal(findPipeline(store.pipelines, record.id).target.label, "UAT");
    const parsed = parsePipelineStore(JSON.stringify(store));
    assert.equal(parsed.pipelines[0].name, "Sandbox to UAT");
    const org = matchOrg(
      [{ username: "a@x.com", instanceUrl: "https://dev.my.salesforce.com", label: "Dev" }],
      record.source
    );
    assert.equal(org.label, "Dev");
    assert.match(pipelineId("Sandbox to UAT", 1), /^sandbox-to-uat-/);
  });

  it("names a promotion path from orgs and can add Staging after QA", () => {
    const hop = createPipeline({
      source: { label: "DEC", username: "dec@x.com", instanceUrl: "https://dec.my.salesforce.com" },
      target: { label: "QA", username: "qa@x.com", instanceUrl: "https://qa.my.salesforce.com" }
    });
    assert.equal(hop.name, "DEC → QA");
    assert.deepEqual(stagesFromPipeline(hop).map((s) => s.label), ["DEC", "QA"]);
    const longer = appendStage(hop, { label: "Staging", username: "stg@x.com", instanceUrl: "https://stg.my.salesforce.com" });
    assert.equal(pipelinePathLabel(longer), "DEC → QA → Staging");
    const next = nextHopAfter(longer, { label: "QA", username: "qa@x.com", instanceUrl: "https://qa.my.salesforce.com" });
    assert.equal(next.target.label, "Staging");
    const store = upsertPipeline(emptyPipelineStore(), longer);
    const found = findMatchingPipeline(
      store.pipelines,
      { username: "dec@x.com", instanceUrl: "https://dec.my.salesforce.com" },
      { username: "qa@x.com", instanceUrl: "https://qa.my.salesforce.com" }
    );
    assert.equal(found.id, hop.id);
  });
});

describe("standard objects", () => {
  it("adds Account and Contact when listing CustomObject members", () => {
    assert.equal(isStandardObject("Account"), true);
    const merged = withStandardObjectMembers("CustomObject", [{ fullName: "My_Thing__c", type: "CustomObject" }]);
    assert.equal(merged.some((i) => i.fullName === "Account" && i.standard), true);
    assert.equal(merged.some((i) => i.fullName === "Contact"), true);
    assert.equal(merged.find((i) => i.fullName === "My_Thing__c").standard, undefined);
    assert.equal(STANDARD_OBJECTS.includes("Opportunity"), true);
    assert.equal(memberObjectKey("CustomField", "Account.Status__c"), "Account");
    const objects = objectFilterOptions("CustomField", [{ fullName: "Account.Status__c" }]);
    assert.equal(objects.includes("Account"), true);
  });
});
