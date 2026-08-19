import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { upsertVersion, createVersionRecord, emptyVersionStore } from "../extension/lib/versions.js";
import {
  loadLocalVersionStore,
  saveLocalVersionStore,
  saveLocalRelease,
  loadLocalRelease,
  resetLocalVersionMemory
} from "../extension/lib/localVersions.js";

describe("local Jira versions (no Git)", () => {
  beforeEach(() => resetLocalVersionMemory());

  it("stores a snapshot in this browser and reads it back", async () => {
    const record = createVersionRecord({ jira: "PROJ-55", increment: 1, comment: "Account fields" });
    record.storage = "local";
    const store = upsertVersion(emptyVersionStore(), record);
    await saveLocalVersionStore(store);
    await saveLocalRelease(record.id, [{ path: "objects/Account.object", base64: "QQ==" }]);

    const loaded = await loadLocalVersionStore();
    assert.equal(loaded.versions[0].id, "PROJ-55-v1");
    assert.equal(loaded.versions[0].storage, "local");
    const files = await loadLocalRelease("PROJ-55-v1");
    assert.equal(files.length, 1);
    assert.equal(files[0].path, "objects/Account.object");
  });
});
