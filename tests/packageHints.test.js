import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  objectsFromPackage,
  relatedTypeHints,
  recentHintItems,
  packageHasMember,
  shortTypeLabel
} from "../extension/lib/packageHints.js";

describe("package hints", () => {
  it("finds the object with the most selected members", () => {
    const objects = objectsFromPackage([
      { name: "CustomField", members: ["Account.Status__c", "Account.Type__c", "Contact.Role__c"] },
      { name: "Layout", members: ["Account-Account Layout"] }
    ]);
    assert.equal(objects[0].object, "Account");
    assert.equal(objects[0].count, 3);
    assert.equal(objects[1].object, "Contact");
  });

  it("suggests sibling types for that object without repeating the current type", () => {
    const hints = relatedTypeHints(
      [{ name: "CustomField", members: ["Account.Status__c"] }],
      "CustomField",
      4
    );
    assert.equal(hints.object, "Account");
    assert.deepEqual(hints.types.map((t) => t.type), ["Layout", "RecordType", "ValidationRule", "FlexiPage"]);
    assert.equal(shortTypeLabel("CustomField"), "Fields");
  });

  it("lists newest members inside the time window and caps the count", () => {
    const now = Date.parse("2026-08-20T12:00:00Z");
    const items = recentHintItems({
      CustomField: [
        { fullName: "Account.Old__c", lastModifiedDate: "2026-01-01T00:00:00Z" },
        { fullName: "Account.New__c", lastModifiedDate: "2026-08-20T10:00:00Z" }
      ],
      Flow: [
        { fullName: "Account_Status_Flow", lastModifiedDate: "2026-08-19T12:00:00Z" }
      ]
    }, { now, windowMs: 7 * 24 * 60 * 60 * 1000, limit: 6 });
    assert.deepEqual(items.map((i) => i.fullName), ["Account.New__c", "Account_Status_Flow"]);
    assert.equal(packageHasMember([{ name: "CustomField", members: ["Account.New__c"] }], "CustomField", "Account.New__c"), true);
    assert.equal(packageHasMember([{ name: "CustomField", members: ["Account.New__c"] }], "CustomField", "Account.Old__c"), false);
  });
});
