import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isTestClassName,
  suggestedTestName,
  suggestedTestClasses,
  packageHasApex,
  categoryColumns,
  filterCategoryColumns,
  memberGroupKey
} from "../extension/lib/packageView.js";

describe("test class names", () => {
  it("detects common Salesforce test suffixes", () => {
    assert.equal(isTestClassName("AccountServiceTest"), true);
    assert.equal(isTestClassName("AccountService_Test"), true);
    assert.equal(isTestClassName("AccountTests"), true);
    assert.equal(isTestClassName("AccountService"), false);
    assert.equal(isTestClassName("*"), false);
  });

  it("suggests *Test for production classes in the package", () => {
    const result = suggestedTestClasses([
      { name: "ApexClass", members: ["AccountService", "AccountServiceTest", "LeadHandler"] },
      { name: "CustomField", members: ["Account.Status__c"] }
    ]);
    assert.deepEqual(result.inPackage, ["AccountServiceTest"]);
    assert.equal(result.suggested.includes("AccountServiceTest"), false);
    assert.ok(result.suggested.includes("LeadHandlerTest"));
    assert.equal(packageHasApex([{ name: "ApexTrigger", members: ["AccountTrigger"] }]), true);
    assert.equal(suggestedTestName("LeadHandler"), "LeadHandlerTest");
  });
});

describe("category columns", () => {
  it("groups custom fields by object so large orgs stay readable", () => {
    assert.equal(memberGroupKey("CustomField", "Account.Status__c"), "Account");
    assert.equal(memberGroupKey("Layout", "Account-Account Layout"), "Account");
    const columns = categoryColumns([
      { name: "CustomField", members: ["Account.Status__c", "Account.Type__c", "Contact.Role__c"] },
      { name: "Flow", members: ["Account_Status_Flow"] }
    ]);
    const fields = columns.find((c) => c.type === "CustomField");
    assert.equal(fields.count, 3);
    assert.deepEqual(
      fields.groups.map((g) => g.label),
      ["Account", "Contact"]
    );
    assert.equal(fields.groups[0].count, 2);
    const filtered = filterCategoryColumns(columns, "contact");
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].groups[0].label, "Contact");
  });
});
