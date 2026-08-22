import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  distinctTarget,
  orgsAreSame,
  pickOtherOrg,
  sessionAfterOrgChange
} from "../extension/lib/orgPath.js";

describe("org path", () => {
  it("treats blank or matching keys as not a valid From → To pair", () => {
    assert.equal(orgsAreSame("a", "a"), true);
    assert.equal(orgsAreSame("a", "b"), false);
    assert.equal(orgsAreSame("", "a"), false);
    assert.equal(distinctTarget("dec", "dec"), "");
    assert.equal(distinctTarget("dec", "qa"), "qa");
    assert.equal(pickOtherOrg(["dec", "qa"], "dec"), "qa");
    assert.equal(pickOtherOrg(["dec", "qa", "prod"], "dec"), "");
  });

  it("resets the package when From changes mid-wizard", () => {
    const next = sessionAfterOrgChange({
      changed: "source",
      previousSource: "dec",
      nextSource: "qa",
      nextTarget: "prod",
      hadRetrieve: true
    });
    assert.deepEqual(next, {
      resetPackage: true,
      invalidateRetrieve: true,
      bounceTo: "package"
    });
  });

  it("requires retrieve again when To changes after a retrieve", () => {
    const next = sessionAfterOrgChange({
      changed: "target",
      previousTarget: "qa",
      nextTarget: "prod",
      nextSource: "dec",
      hadRetrieve: true
    });
    assert.deepEqual(next, {
      resetPackage: false,
      invalidateRetrieve: true,
      bounceTo: "review"
    });
  });

  it("sends the user back to Start when To is cleared or matches From", () => {
    const same = sessionAfterOrgChange({
      changed: "target",
      previousTarget: "qa",
      nextTarget: "",
      nextSource: "dec",
      hadRetrieve: true
    });
    assert.equal(same.bounceTo, "start");
    assert.equal(same.invalidateRetrieve, true);
  });

  it("does not wipe a planned promotion hop", () => {
    const next = sessionAfterOrgChange({
      changed: "source",
      previousSource: "dec",
      nextSource: "qa",
      nextTarget: "prod",
      hadRetrieve: true,
      promotingHop: true
    });
    assert.deepEqual(next, {
      resetPackage: false,
      invalidateRetrieve: false,
      bounceTo: ""
    });
  });
});
