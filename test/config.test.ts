import assert from "node:assert/strict";
import { test } from "node:test";
import { loadConfig } from "../src/config";

test("requires a strong access token for non-loopback binding", () => {
  assert.throws(() => loadConfig({ HOST: "0.0.0.0" }, process.cwd()), /ACCESS_TOKEN is required/u);
  assert.throws(() => loadConfig({ ACCESS_TOKEN: "short" }, process.cwd()), /at least 16/u);
  const config = loadConfig({ HOST: "0.0.0.0", ACCESS_TOKEN: "a-secure-token-value", ACCESS_MODE: "upload" }, process.cwd());
  assert.equal(config.accessMode, "upload");
  assert.equal(config.host, "0.0.0.0");
});
