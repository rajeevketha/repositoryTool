import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  escapeXml,
  buildPackageXml,
  typesFromPackageXml,
  retrieveBody,
  deployBody,
  parseRetrieveResult,
  parseDeployResult,
  parseAsyncId
} from "../extension/lib/packageXml.js";
import { parseRepoInput } from "../extension/lib/github.js";

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
});

describe("github repo parsing", () => {
  it("accepts urls and owner/name", () => {
    assert.deepEqual(parseRepoInput("https://github.com/acme/sf-meta.git"), { owner: "acme", repo: "sf-meta" });
    assert.deepEqual(parseRepoInput("acme/sf-meta"), { owner: "acme", repo: "sf-meta" });
    assert.equal(parseRepoInput(""), null);
  });
});
