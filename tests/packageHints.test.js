import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  objectsFromPackage,
  relatedTypeHints,
  recentHintItems,
  packageHasMember,
  shortTypeLabel,
  memberBelongsToObject,
  companionOffer,
  RECENT_HINT_TYPES
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
    }, { now, windowMs: 7 * 24 * 60 * 60 * 1000, limit: 8 });
    assert.deepEqual(items.map((i) => i.fullName), ["Account.New__c", "Account_Status_Flow"]);
    assert.equal(packageHasMember([{ name: "CustomField", members: ["Account.New__c"] }], "CustomField", "Account.New__c"), true);
    assert.equal(packageHasMember([{ name: "CustomField", members: ["Account.New__c"] }], "CustomField", "Account.Old__c"), false);
  });

  it("includes today's Apex class in the recent list", () => {
    assert.ok(RECENT_HINT_TYPES.includes("ApexClass"));
    assert.ok(RECENT_HINT_TYPES.includes("ApexTrigger"));
    const now = Date.parse("2026-08-20T12:00:00Z");
    const items = recentHintItems({
      ApexClass: [{ fullName: "RepoController", lastModifiedDate: "2026-08-20T11:00:00Z" }],
      CustomField: [{ fullName: "Account.Status__c", lastModifiedDate: "2026-08-19T12:00:00Z" }]
    }, { now, windowMs: 7 * 24 * 60 * 60 * 1000, limit: 8 });
    assert.equal(items[0].type, "ApexClass");
    assert.equal(items[0].fullName, "RepoController");
  });

  it("matches layouts, fields, and Lightning pages to an object", () => {
    assert.equal(memberBelongsToObject("Layout", "Account-Account Layout", "Account"), true);
    assert.equal(memberBelongsToObject("Layout", "Contact-Contact Layout", "Account"), false);
    assert.equal(memberBelongsToObject("CustomField", "Account.Status__c", "Account"), true);
    assert.equal(memberBelongsToObject("FlexiPage", "Account_Record_Page", "Account"), true);
    assert.equal(memberBelongsToObject("FlexiPage", "Opportunity_Record_Page", "Account"), false);
  });

  it("offers a one-tap add only when the matching list is small", () => {
    const offer = companionOffer(
      [{ name: "CustomField", members: ["Account.Status__c"] }],
      {
        Layout: [
          { fullName: "Account-Account Layout" },
          { fullName: "Account-Sales Layout" },
          { fullName: "Contact-Contact Layout" }
        ],
        RecordType: [{ fullName: "Account.Customer" }]
      },
      { activeType: "CustomField" }
    );
    assert.equal(offer.object, "Account");
    assert.equal(offer.add.type, "Layout");
    assert.equal(offer.add.count, 2);
    assert.match(offer.add.title, /2 layouts on Account/);
    assert.deepEqual(offer.add.members, ["Account-Account Layout", "Account-Sales Layout"]);
    assert.equal(offer.permissionSets, true);
  });

  it("turns a crowded type into browse instead of adding everything", () => {
    const layouts = Array.from({ length: 8 }, (_, i) => ({ fullName: `Account-Layout ${i}` }));
    const offer = companionOffer(
      [{ name: "CustomField", members: ["Account.Status__c"] }],
      { Layout: layouts },
      { activeType: "CustomField", maxPerType: 4 }
    );
    assert.equal(offer.add, null);
    assert.equal(offer.browse[0].type, "Layout");
    assert.equal(offer.browse[0].count, 8);
  });

  it("skips a dismissed companion type", () => {
    const offer = companionOffer(
      [{ name: "CustomField", members: ["Account.Status__c"] }],
      { Layout: [{ fullName: "Account-Account Layout" }] },
      { dismissedKeys: ["Account:Layout"] }
    );
    assert.equal(offer.add, null);
  });
});
