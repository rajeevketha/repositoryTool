import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  inspectRepoLayout,
  layoutCopy,
  snapshotTreeText,
  scaffoldProjectFiles,
  SALESFORCE_METADATA_FOLDERS
} from "../extension/lib/projectLayout.js";

describe("Salesforce project layout", () => {
  it("detects an existing DX project like force-app/main/default", () => {
    const inspect = inspectRepoLayout([
      { name: "force-app", type: "dir" },
      { name: "sfdx-project.json", type: "file" },
      { name: "manifest", type: "dir" },
      { name: "config", type: "dir" }
    ]);
    assert.equal(inspect.kind, "sfdx");
    assert.equal(inspect.hasForceApp, true);
    const copy = layoutCopy(inspect, { repoLabel: "acme/DIGICERT@main (GitHub)" });
    assert.match(copy.body, /will not overwrite/);
    assert.equal(copy.canScaffold, false);
    assert.equal(copy.viewPath, "force-app/main/default");
  });

  it("treats a README-only repo as empty and offers to create folders", () => {
    const inspect = inspectRepoLayout([{ name: "README.md", type: "file" }]);
    assert.equal(inspect.kind, "empty");
    const copy = layoutCopy(inspect, { repoLabel: "acme/sf@main (GitHub)" });
    assert.equal(copy.canScaffold, true);
    assert.match(copy.body, /Create Salesforce DX folders/);
  });

  it("does not offer to scaffold when .orgflow snapshots already exist", () => {
    const inspect = inspectRepoLayout([{ name: ".orgflow", type: "dir" }]);
    assert.equal(inspect.kind, "orgflow");
    assert.equal(layoutCopy(inspect).canScaffold, false);
    assert.equal(layoutCopy(inspect).viewPath, ".orgflow");
  });

  it("groups snapshot files by Salesforce metadata folders", () => {
    const text = snapshotTreeText(
      [
        { path: "classes/RepoController.cls" },
        { path: "classes/RepoController.cls-meta.xml" },
        { path: "package.xml" }
      ],
      ".orgflow/releases/PROJ-123/v1"
    );
    assert.match(text, /\.orgflow\/releases\/PROJ-123\/v1\//);
    assert.match(text, /classes\/\s+2 files/);
    assert.match(text, /1 file/);
  });

  it("builds a DX-shaped scaffold with the usual metadata folders", () => {
    const files = scaffoldProjectFiles({ apiVersion: "61.0", repoName: "DIGICERT" });
    const paths = files.map((f) => f.path);
    assert.ok(paths.includes("sfdx-project.json"));
    assert.ok(paths.includes(".orgflow/README.md"));
    assert.ok(paths.includes(".forceignore"));
    for (const folder of SALESFORCE_METADATA_FOLDERS) {
      assert.ok(paths.includes(`force-app/main/default/${folder}/.gitkeep`), folder);
    }
    const sfdx = files.find((f) => f.path === "sfdx-project.json").text;
    assert.match(sfdx, /"path": "force-app"/);
    assert.match(sfdx, /"name": "DIGICERT"/);
  });
});
