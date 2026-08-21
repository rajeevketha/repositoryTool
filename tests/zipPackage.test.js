import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateZipPackage,
  stripZipPrefix,
  candidatePathsForMember
} from "../extension/lib/zipPackage.js";

function xml(types) {
  const blocks = types.map((t) => {
    const members = t.members.map((m) => `        <members>${m}</members>`).join("\n");
    return `    <types>\n${members}\n        <name>${t.name}</name>\n    </types>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
${blocks}
    <version>61.0</version>
</Package>
`;
}

describe("zip package validation", () => {
  it("strips unpackaged/ so package.xml is at the root", () => {
    const { prefix, paths } = stripZipPrefix([
      "unpackaged/package.xml",
      "unpackaged/classes/Hello.cls"
    ]);
    assert.equal(prefix, "unpackaged");
    assert.deepEqual(paths.sort(), ["classes/Hello.cls", "package.xml"]);
  });

  it("accepts a Workbench mdapi zip when package.xml matches files", () => {
    const report = validateZipPackage([
      { path: "package.xml", text: xml([{ name: "ApexClass", members: ["Hello"] }]) },
      { path: "classes/Hello.cls", text: "public class Hello {}" },
      { path: "classes/Hello.cls-meta.xml", text: "<ApexClass/>" }
    ]);
    assert.equal(report.ok, true);
    assert.equal(report.errors.length, 0);
    assert.equal(report.types[0].name, "ApexClass");
  });

  it("rejects a DX force-app zip", () => {
    const report = validateZipPackage([
      { path: "sfdx-project.json", text: "{}" },
      { path: "force-app/main/default/classes/Hello.cls", text: "public class Hello {}" },
      { path: "manifest/package.xml", text: xml([{ name: "ApexClass", members: ["Hello"] }]) }
    ]);
    assert.equal(report.ok, false);
    assert.match(report.errors.join(" "), /DX|force-app|Metadata API/i);
  });

  it("fails when package.xml lists a member that is not in the zip", () => {
    const report = validateZipPackage([
      { path: "package.xml", text: xml([{ name: "ApexClass", members: ["Hello", "Missing"] }]) },
      { path: "classes/Hello.cls", text: "public class Hello {}" }
    ]);
    assert.equal(report.ok, false);
    assert.match(report.errors.join(" "), /Missing/);
  });

  it("requires package.xml", () => {
    const report = validateZipPackage([
      { path: "classes/Hello.cls", text: "public class Hello {}" }
    ]);
    assert.equal(report.ok, false);
    assert.match(report.errors.join(" "), /package\.xml/);
  });

  it("maps CustomField to the parent object file or a nested field file", () => {
    const nested = candidatePathsForMember("CustomField", "Account.Status__c");
    assert.ok(nested.some((p) => p.includes("Account.object")));
    assert.ok(nested.some((p) => p.includes("fields/Status__c")));

    const report = validateZipPackage([
      { path: "package.xml", text: xml([{ name: "CustomField", members: ["Account.Status__c"] }]) },
      { path: "objects/Account.object", text: "<CustomObject/>" }
    ]);
    assert.equal(report.ok, true);
  });

  it("accepts a custom object zip with a wrapper folder", () => {
    const report = validateZipPackage([
      { path: "MyPkg/package.xml", text: xml([{ name: "CustomObject", members: ["Thing__c"] }]) },
      { path: "MyPkg/objects/Thing__c.object", text: "<CustomObject/>" }
    ]);
    assert.equal(report.ok, true);
    assert.ok(report.files.some((f) => f.path === "package.xml"));
  });
});
