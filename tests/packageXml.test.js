import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  escapeXml,
  buildPackageXml,
  buildPackageXmlFromTypes,
  parsePackageXml,
  typesFromPackageXml,
  retrieveBody,
  retrieveBodyFromTypes,
  deployBody,
  parseRetrieveResult,
  parseDeployResult,
  parseAsyncId,
  parseListMetadata,
  toggleMember,
  memberCount,
  assertPackageXml,
  formatDeployOutcome,
  formatRetrieveOutcome,
  formatOperationOutcome
} from "../extension/lib/packageXml.js";
import { parseRepoInput } from "../extension/lib/github.js";
import { isEditablePath } from "../extension/lib/files.js";

describe("package.xml", () => {
  it("builds a wildcard package for selected types", () => {
    const xml = buildPackageXml(["ApexClass", "Flow"], "61.0");
    assert.match(xml, /<name>ApexClass<\/name>/);
    assert.match(xml, /<name>Flow<\/name>/);
    assert.match(xml, /<members>\*<\/members>/);
    assert.match(xml, /<version>61.0<\/version>/);
    assert.deepEqual(typesFromPackageXml(xml).sort(), ["ApexClass", "Flow"]);
  });

  it("escapes xml", () => {
    assert.equal(escapeXml(`a&b<"'>`), "a&amp;b&lt;&quot;&apos;&gt;");
  });

  it("embeds types in retrieve SOAP", () => {
    const body = retrieveBody(["LightningComponentBundle"], "61.0");
    assert.match(body, /<urn:name>LightningComponentBundle<\/urn:name>/);
    assert.match(body, /<urn:singlePackage>true<\/urn:singlePackage>/);
  });

  it("honors checkOnly and testLevel on deploy", () => {
    const body = deployBody("QUJD", { checkOnly: true, testLevel: "RunLocalTests" });
    assert.match(body, /<urn:checkOnly>true<\/urn:checkOnly>/);
    assert.match(body, /<urn:testLevel>RunLocalTests<\/urn:testLevel>/);
    assert.match(body, />QUJD</);
  });

  it("emits RunSpecifiedTests and runTests for the test runner", () => {
    const body = deployBody("QUJD", { testLevel: "NoTestRun", runTests: ["AccountServiceTest", "LeadHandlerTest"] });
    assert.match(body, /<urn:testLevel>RunSpecifiedTests<\/urn:testLevel>/);
    assert.match(body, /<urn:runTests>AccountServiceTest<\/urn:runTests>/);
    assert.match(body, /<urn:runTests>LeadHandlerTest<\/urn:runTests>/);
  });

  it("round-trips specific members in package.xml", () => {
    const xml = buildPackageXmlFromTypes(
      [
        { name: "ApexClass", members: ["Foo", "Bar"] },
        { name: "Flow", members: ["My_Flow"] }
      ],
      "61.0"
    );
    const parsed = parsePackageXml(xml);
    assert.deepEqual(parsed.types, [
      { name: "ApexClass", members: ["Bar", "Foo"] },
      { name: "Flow", members: ["My_Flow"] }
    ]);
    assert.equal(memberCount(parsed.types), 3);
    assert.match(retrieveBodyFromTypes(parsed.types, "61.0"), /<urn:members>Foo<\/urn:members>/);
  });

  it("rejects invalid package xml", () => {
    assert.throws(() => assertPackageXml("<not-a-package/>"), /missing <Package>/);
  });

  it("toggles members and expands a wildcard uncheck", () => {
    let types = toggleMember([], "ApexClass", "Foo", true);
    types = toggleMember(types, "ApexClass", "Bar", true);
    assert.deepEqual(types[0].members, ["Bar", "Foo"]);
    types = [{ name: "ApexClass", members: ["*"] }];
    types = toggleMember(types, "ApexClass", "Bar", false, ["Foo", "Bar", "Baz"]);
    assert.deepEqual(types[0].members, ["Baz", "Foo"]);
  });
});

describe("soap result parsing", () => {
  it("reads retrieve success and zip", () => {
    const xml = `<result><id>09Sxx</id><done>true</done><success>true</success><status>Succeeded</status><zipFile>UEsD</zipFile></result>`;
    const parsed = parseRetrieveResult(xml);
    assert.equal(parsed.done, true);
    assert.equal(parsed.success, true);
    assert.equal(parsed.zipFile, "UEsD");
    assert.equal(parseAsyncId(xml), "09Sxx");
  });

  it("surfaces component failures", () => {
    const xml = `<result>
      <done>true</done><success>false</success><status>Failed</status>
      <componentFailures><fullName>Foo</fullName><componentType>ApexClass</componentType><problem>Missing {</problem></componentFailures>
    </result>`;
    const parsed = parseDeployResult(xml);
    assert.equal(parsed.success, false);
    assert.equal(parsed.failures[0].fullName, "Foo");
    assert.match(parsed.failures[0].problem, /Missing/);
  });

  it("reads line numbers, successes, and Apex test failures", () => {
    const xml = `<result>
      <done>true</done><success>false</success><status>Failed</status>
      <numberComponentErrors>1</numberComponentErrors>
      <componentFailures>
        <fullName>Account.Status__c</fullName>
        <componentType>CustomField</componentType>
        <problem>Invalid type</problem>
        <fileName>objects/Account.object</fileName>
        <lineNumber>12</lineNumber>
        <columnNumber>4</columnNumber>
      </componentFailures>
      <componentSuccesses>
        <fullName>Account.Layout</fullName>
        <componentType>Layout</componentType>
      </componentSuccesses>
      <runTestResult>
        <failures>
          <name>AccountServiceTest</name>
          <methodName>createsAccount</methodName>
          <message>System.AssertException: Assertion Failed</message>
        </failures>
      </runTestResult>
    </result>`;
    const parsed = parseDeployResult(xml);
    assert.equal(parsed.failures[0].lineNumber, "12");
    assert.equal(parsed.failures[0].fileName, "objects/Account.object");
    assert.equal(parsed.successes[0].fullName, "Account.Layout");
    assert.equal(parsed.testFailures[0].methodName, "createsAccount");
    const formatted = formatDeployOutcome(parsed);
    assert.equal(formatted.ok, false);
    assert.match(formatted.title, /Failed/);
    assert.equal(formatted.items.some((i) => i.kind === "component" && /Invalid type/.test(i.problem)), true);
    assert.equal(formatted.items.some((i) => i.kind === "test" && /Assertion/.test(i.problem)), true);
    assert.match(formatted.items.find((i) => i.kind === "component").where, /line 12/);
  });

  it("formats retrieve and deploy waiting/success states", () => {
    const running = formatOperationOutcome({ running: true, operation: "retrieve" });
    assert.equal(running.ok, null);
    assert.match(running.title, /Retriev/);
    const retrieved = formatRetrieveOutcome({ success: true, status: "Succeeded", fileCount: 4 });
    assert.equal(retrieved.ok, true);
    assert.match(retrieved.items[0].text, /4 file/);
    const deployed = formatDeployOutcome({
      success: true,
      status: "Succeeded",
      successes: [{ fullName: "Hello", componentType: "ApexClass" }]
    });
    assert.equal(deployed.ok, true);
    assert.equal(deployed.items[0].kind, "success");
    assert.equal(deployed.items[0].name, "Hello");
  });

  it("parses listMetadata members", () => {
    const xml = `<listMetadataResponse>
      <result><fullName>Hello</fullName><type>ApexClass</type></result>
      <result><fullName>World</fullName><type>ApexClass</type></result>
    </listMetadataResponse>`;
    const listed = parseListMetadata(xml);
    assert.deepEqual(listed.map((i) => i.fullName), ["Hello", "World"]);
  });
});

describe("github repo parsing", () => {
  it("accepts urls and owner/name", () => {
    assert.deepEqual(parseRepoInput("https://github.com/acme/sf-meta.git"), { owner: "acme", repo: "sf-meta" });
    assert.deepEqual(parseRepoInput("acme/sf-meta"), { owner: "acme", repo: "sf-meta" });
    assert.equal(parseRepoInput(""), null);
  });
});

describe("editable metadata files", () => {
  it("allows xml and apex, not zip/png", () => {
    assert.equal(isEditablePath("objects/Account.object"), true);
    assert.equal(isEditablePath("objects/Account.object-meta.xml"), true);
    assert.equal(isEditablePath("package.xml"), true);
    assert.equal(isEditablePath("classes/Foo.cls"), true);
    assert.equal(isEditablePath("staticresources/logo.png"), false);
  });
});
