import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  unifiedDiff,
  compareFileSets,
  revertSelectedInto,
  splitLines,
  diffRows
} from "../extension/lib/diff.js";

function file(path, text) {
  return { path, base64: Buffer.from(text, "utf8").toString("base64") };
}

describe("diff", () => {
  it("returns empty unified diff for identical text", () => {
    assert.equal(unifiedDiff("a\nb\n", "a\nb\n"), "");
    assert.deepEqual(diffRows("same", "same"), []);
  });

  it("shows added and removed Apex lines", () => {
    const left = "public class Foo {\n  Integer a;\n}\n";
    const right = "public class Foo {\n  Integer a;\n  Integer b;\n}\n";
    const diff = unifiedDiff(left, right, { leftLabel: "v1/classes/Foo.cls", rightLabel: "v2/classes/Foo.cls" });
    assert.match(diff, /--- v1\/classes\/Foo.cls/);
    assert.match(diff, /\+\+\+ v2\/classes\/Foo.cls/);
    assert.match(diff, /\+  Integer b;/);
  });

  it("splits lines without keeping CR", () => {
    assert.deepEqual(splitLines("a\r\nb\r\n"), ["a", "b", ""]);
  });

  it("compares metadata file sets", () => {
    const current = [
      file("classes/Foo.cls", "v2"),
      file("objects/Account.object", "same")
    ];
    const previous = [
      file("classes/Foo.cls", "v1"),
      file("objects/Account.object", "same"),
      file("classes/Bar.cls", "old")
    ];
    const rows = compareFileSets(current, previous);
    const byPath = Object.fromEntries(rows.map((r) => [r.path, r.status]));
    assert.equal(byPath["classes/Foo.cls"], "changed");
    assert.equal(byPath["objects/Account.object"], "same");
    assert.equal(byPath["classes/Bar.cls"], "onlyRight");
  });

  it("marks files only in current retrieve as onlyLeft", () => {
    const rows = compareFileSets([file("a.xml", "now")], [file("b.xml", "old")]);
    assert.equal(rows.find((r) => r.path === "a.xml").status, "onlyLeft");
    assert.equal(rows.find((r) => r.path === "b.xml").status, "onlyRight");
  });

  it("reverts selected files from another version", () => {
    const current = [file("classes/Foo.cls", "new"), file("package.xml", "pkg")];
    const older = [file("classes/Foo.cls", "old"), file("classes/Bar.cls", "bar")];
    const next = revertSelectedInto(current, older, ["classes/Foo.cls", "classes/Bar.cls"]);
    const byPath = Object.fromEntries(next.map((f) => [f.path, Buffer.from(f.base64, "base64").toString("utf8")]));
    assert.equal(byPath["classes/Foo.cls"], "old");
    assert.equal(byPath["classes/Bar.cls"], "bar");
    assert.equal(byPath["package.xml"], "pkg");
    assert.equal(next.find((f) => f.path === "classes/Foo.cls").edited, true);
  });
});
