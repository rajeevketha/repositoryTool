import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseRepoInput, providerMeta, providerId, tokenUrl } from "../extension/lib/gitHost.js";
import { mergeSettings, isGitConfigured, repoLabel } from "../extension/lib/storage.js";

describe("git hosts", () => {
  it("parses GitHub owner/repo and URLs", () => {
    assert.deepEqual(parseRepoInput("github", "acme/sf"), { owner: "acme", repo: "sf" });
    assert.deepEqual(parseRepoInput("github", "https://github.com/acme/sf.git"), { owner: "acme", repo: "sf" });
  });

  it("parses GitLab nested groups", () => {
    assert.deepEqual(parseRepoInput("gitlab", "acme/sf"), { owner: "acme", repo: "sf", project: "" });
    assert.deepEqual(parseRepoInput("gitlab", "https://gitlab.com/acme/team/sf.git"), {
      owner: "acme/team",
      repo: "sf",
      project: ""
    });
    assert.deepEqual(parseRepoInput("gitlab", "https://gitlab.example.com/platform/sf/metadata"), {
      owner: "platform/sf",
      repo: "metadata",
      project: ""
    });
  });

  it("parses Azure DevOps org/project/repo", () => {
    assert.deepEqual(parseRepoInput("azuredevops", "myorg/MyProject/sf"), {
      owner: "myorg",
      project: "MyProject",
      repo: "sf"
    });
    assert.deepEqual(
      parseRepoInput("azuredevops", "https://dev.azure.com/myorg/MyProject/_git/sf"),
      { owner: "myorg", project: "MyProject", repo: "sf" }
    );
    assert.deepEqual(
      parseRepoInput("azuredevops", "https://myorg.visualstudio.com/MyProject/_git/sf"),
      { owner: "myorg", project: "MyProject", repo: "sf" }
    );
  });

  it("migrates a GitHub-only settings object into gitHost", () => {
    const merged = mergeSettings({ github: { token: "ghp_x", owner: "acme", repo: "sf", branch: "main" } });
    assert.equal(merged.gitHost.provider, "github");
    assert.equal(merged.gitHost.owner, "acme");
    assert.equal(isGitConfigured(merged), true);
    assert.equal(providerId(merged), "github");
    assert.equal(providerMeta("gitlab").label, "GitLab");
  });

  it("labels Azure repos with project", () => {
    const merged = mergeSettings({
      gitHost: {
        provider: "azuredevops",
        token: "pat",
        owner: "myorg",
        project: "MyProject",
        repo: "sf",
        branch: "main"
      }
    });
    assert.equal(isGitConfigured(merged), true);
    assert.equal(repoLabel(merged), "myorg/MyProject/sf@main (Azure DevOps)");
  });

  it("requires an Azure project before the repo counts as connected", () => {
    const merged = mergeSettings({
      gitHost: { provider: "azuredevops", token: "pat", owner: "myorg", repo: "sf", branch: "main" }
    });
    assert.equal(isGitConfigured(merged), false);
  });

  it("builds token pages for GitLab instances and Azure orgs", () => {
    assert.equal(tokenUrl("github"), "https://github.com/settings/tokens");
    assert.equal(tokenUrl("gitlab"), "https://gitlab.com/-/user_settings/personal_access_tokens");
    assert.equal(
      tokenUrl("gitlab", { baseUrl: "https://gitlab.example.com/" }),
      "https://gitlab.example.com/-/user_settings/personal_access_tokens"
    );
    assert.equal(tokenUrl("azuredevops"), "https://dev.azure.com");
    assert.equal(
      tokenUrl("azuredevops", { owner: "acme" }),
      "https://dev.azure.com/acme/_usersSettings/tokens"
    );
  });
});
