import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  namedPackageMembers,
  typesToPreflight,
  buildPreflightReport,
  existingNameSet,
  PREFLIGHT_MEMBER_CAP
} from "../extension/lib/preflight.js";

describe("To org preflight", () => {
  it("collects named members and parent custom objects", () => {
    const types = [
      { name: "CustomField", members: ["Account.Status__c", "My_Thing__c.Flag__c"] },
      { name: "Layout", members: ["Account-Account Layout"] },
      { name: "ApexClass", members: ["*"] }
    ];
    assert.deepEqual(namedPackageMembers(types).map((row) => row.member), [
      "Account.Status__c",
      "My_Thing__c.Flag__c",
      "Account-Account Layout"
    ]);
    const queries = typesToPreflight(types);
    assert.deepEqual(queries.find((row) => row.name === "CustomObject")?.members, ["My_Thing__c"]);
    assert.equal(queries.some((row) => row.name === "ApexClass"), false);
  });

  it("flags members already in To, new members, and a missing custom object", () => {
    const report = buildPreflightReport({
      packageTypes: [
        { name: "CustomField", members: ["Account.Status__c", "My_Thing__c.Flag__c"] }
      ],
      existingByType: {
        CustomField: existingNameSet(["Account.Status__c"]),
        CustomObject: existingNameSet([])
      },
      listedTypes: ["CustomField", "CustomObject"]
    });
    assert.equal(report.already, 1);
    assert.equal(report.fresh, 1);
    assert.equal(report.missingParent, 1);
    assert.equal(report.items.some((item) => item.kicker === "Already in To"), true);
    assert.equal(report.items.some((item) => item.kicker === "New in To"), true);
    assert.match(report.items.find((item) => item.kicker === "Missing object in To").text, /My_Thing__c/);
  });

  it("does not warn about a custom object that is also in the package", () => {
    const report = buildPreflightReport({
      packageTypes: [
        { name: "CustomObject", members: ["My_Thing__c"] },
        { name: "CustomField", members: ["My_Thing__c.Flag__c"] }
      ],
      existingByType: {
        CustomField: existingNameSet([]),
        CustomObject: existingNameSet([])
      },
      listedTypes: ["CustomField", "CustomObject"]
    });
    assert.equal(report.missingParent, 0);
    assert.equal(report.fresh, 2);
  });

  it("warns when To is production and no tests are selected", () => {
    const report = buildPreflightReport({
      packageTypes: [{ name: "Layout", members: ["Account-Account Layout"] }],
      existingByType: { Layout: existingNameSet([]) },
      listedTypes: ["Layout"],
      production: true,
      hasTests: false
    });
    assert.equal(report.items[0].kicker, "Production");
    assert.match(report.summary, /production/);
  });

  it("caps a large package at the first 60 named members", () => {
    const members = Array.from({ length: PREFLIGHT_MEMBER_CAP + 5 }, (_, i) => `Account.Field_${i}__c`);
    const report = buildPreflightReport({
      packageTypes: [{ name: "CustomField", members }],
      existingByType: { CustomField: existingNameSet([]) },
      listedTypes: ["CustomField"]
    });
    assert.equal(report.checked, PREFLIGHT_MEMBER_CAP);
    assert.equal(report.items.some((item) => item.kicker.startsWith("First ")), true);
  });
});
