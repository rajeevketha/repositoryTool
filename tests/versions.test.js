import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeJiraKey,
  isJiraKey,
  mintChangeId,
  nextIncrement,
  versionId,
  releasePath,
  parseVersionStore,
  findLatestForJira,
  findVersion,
  createVersionRecord,
  addDeployment,
  upsertVersion,
  gitShipValidationItems
} from "../extension/lib/versions.js";

describe("jira / version ids", () => {
  it("normalizes jira keys", () => {
    assert.equal(normalizeJiraKey(" proj-123 "), "PROJ-123");
    assert.equal(isJiraKey("PROJ-123"), true);
    assert.equal(isJiraKey("not a ticket"), false);
  });

  it("increments per jira ticket", () => {
    const existing = [
      { jira: "PROJ-123", increment: 1 },
      { jira: "PROJ-123", increment: 2 },
      { jira: "OTHER-1", increment: 9 }
    ];
    assert.equal(nextIncrement(existing, "proj-123"), 3);
    assert.equal(nextIncrement([], "PROJ-9"), 1);
    assert.equal(versionId("proj-123", 3), "PROJ-123-v3");
    assert.equal(releasePath("PROJ-123", 2), ".orgflow/releases/PROJ-123/v2");
  });

  it("mints dated change ids when there is no jira", () => {
    const now = new Date("2026-08-18T12:00:00Z");
    const first = mintChangeId([], now);
    assert.equal(first, "CHANGE-20260818-1");
    const second = mintChangeId([{ jira: first }], now);
    assert.equal(second, "CHANGE-20260818-2");
  });

  it("finds latest version for a ticket", () => {
    const versions = [
      createVersionRecord({ jira: "PROJ-1", increment: 1, comment: "a", createdAt: "2026-01-01T00:00:00Z" }),
      createVersionRecord({ jira: "PROJ-1", increment: 2, comment: "b", createdAt: "2026-01-02T00:00:00Z" })
    ];
    assert.equal(findLatestForJira(versions, "proj-1").id, "PROJ-1-v2");
    assert.equal(findVersion(versions, "PROJ-1-v1").increment, 1);
    assert.equal(findVersion(versions, "PROJ-1").increment, 2);
  });

  it("records deployments against a version", () => {
    let store = parseVersionStore(null);
    const record = createVersionRecord({ jira: "SALES-9", increment: 1, comment: "layout" });
    store = upsertVersion(store, record);
    const withDeploy = addDeployment(store.versions[0], {
      org: { label: "UAT" },
      status: "Succeeded",
      comment: "push to uat"
    });
    store = upsertVersion(store, withDeploy);
    assert.equal(store.versions[0].deployments.length, 1);
    assert.equal(store.versions[0].deployments[0].org.label, "UAT");
  });

  it("explains missing commit before a missing Git repo, and does not require Jira", () => {
    const both = gitShipValidationItems({
      gitEnabled: true,
      commitMessage: "",
      gitConfigured: false,
      hostLabel: "GitHub"
    });
    assert.equal(both.length, 2);
    assert.equal(both[0].kicker, "Commit message");
    assert.match(both[0].text, /Jira is optional/i);
    assert.match(both[0].text, /commit message is required/i);
    assert.equal(both[1].kicker, "Release repo");
    assert.match(both[1].text, /GitHub/);

    const commitOnly = gitShipValidationItems({
      gitEnabled: true,
      commitMessage: "   ",
      gitConfigured: true,
      hostLabel: "GitLab"
    });
    assert.equal(commitOnly.length, 1);
    assert.equal(commitOnly[0].kicker, "Commit message");

    const none = gitShipValidationItems({
      gitEnabled: true,
      commitMessage: "Account status field",
      gitConfigured: true
    });
    assert.deepEqual(none, []);
    assert.deepEqual(gitShipValidationItems({ gitEnabled: false, commitMessage: "" }), []);
  });
});
