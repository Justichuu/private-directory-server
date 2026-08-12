#!/usr/bin/env node
"use strict";

const { existsSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const workspace = path.join(__dirname, "..");
const typescriptMarker = path.join(workspace, "node_modules", "typescript", "package.json");

if (!existsSync(typescriptMarker)) {
  console.log("First run: installing dependencies with 'npm ci' (this happens once)...");
  const result = spawnSync("npm", ["ci"], { cwd: workspace, stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) {
    console.error("Dependency installation failed. Run 'npm ci' manually to see the full error.");
    process.exit(result.status ?? 1);
  }
}
