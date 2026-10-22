import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

function fixture(run: (root: string, addon: string) => void): void {
  const root = mkdtempSync(path.join(os.tmpdir(), "provenance-test-"));
  const addon = path.join(root, "addon");
  try {
    cpSync(path.resolve("provenance"), addon, {
      recursive: true,
      filter: (source) => !["state.json", "decisions.json", "app.html", "preview"].includes(path.basename(source)),
    });
    run(root, addon);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

for (const subject of ["</ScRiPt><script>unexpected()</script><!--<script>", "$& $` $'"]) {
test(`provenance embeds literal JSON: ${subject}`, () => fixture((_root, addon) => {
  const repo = { name: subject, rel: "fixture", subject, remote: "owner/repo", dirty: 0 };
  const decisions = [{ id: subject, title: subject }];
  writeFileSync(path.join(addon, "state.json"), JSON.stringify({ generated: "2026-01-01T00:00:00Z", totals: { repos: 1 }, repos: [repo] }));
  writeFileSync(path.join(addon, "decisions.json"), JSON.stringify(decisions));
  execFileSync(process.execPath, [path.join(addon, "build.mjs")]);
  const html = readFileSync(path.join(addon, "app.html"), "utf8");
  assert.equal((html.match(/<\/script\s*>/giu) || []).length, 1);
  assert.ok(!html.match(/const (?:STATE|ASKS) = .*<.*;\r?\n/u));
  const state = JSON.parse(html.match(/const STATE = (.*);\r?\n/u)![1]!);
  const asks = JSON.parse(html.match(/const ASKS = (.*);\r?\n/u)![1]!);
  assert.equal(state.repos[0].subject, subject);
  assert.equal(state.repos[0].name, subject);
  assert.deepEqual(asks, decisions);
}));
}

test("provenance scanner and builder omit credentials and local remote paths", () => fixture((root, addon) => {
  const workspace = path.join(root, "workspace");
  mkdirSync(workspace);
  const cases = [
    ["credentials", "https://fixture-user:fixture-secret@github.com/owner/repo.git?token=fixture-query", "owner/repo"],
    ["file", "file:///C:/Users/fixture-private/repository", ""],
    ["drive", "C:/Users/fixture-private/repository", ""],
    ["ssh", "git@github.com:owner/repository.git", "owner/repository"],
  ];
  for (const [name, remote] of cases) {
    const repo = path.join(workspace, name!);
    mkdirSync(repo);
    execFileSync("git", ["init", "--quiet", repo]);
    execFileSync("git", ["-C", repo, "remote", "add", "origin", remote!]);
  }
  execFileSync(process.execPath, [path.join(addon, "scan.mjs")], { env: { ...process.env, PROVENANCE_ROOT: workspace } });
  const state = JSON.parse(readFileSync(path.join(addon, "state.json"), "utf8"));
  for (const [name, _remote, expected] of cases) {
    assert.equal(state.repos.find((repo: { name: string }) => repo.name === name).remote, expected);
  }
  // Old snapshots must also be filtered when built, before their data is embedded.
  state.repos = cases.map(([name, remote]) => ({ name, remote }));
  writeFileSync(path.join(addon, "state.json"), JSON.stringify(state));
  writeFileSync(path.join(addon, "decisions.json"), "[]");
  execFileSync(process.execPath, [path.join(addon, "build.mjs")]);
  const html = readFileSync(path.join(addon, "app.html"), "utf8");
  for (const value of ["fixture-user", "fixture-secret", "fixture-query", "fixture-private"]) assert.ok(!html.includes(value));
}));
