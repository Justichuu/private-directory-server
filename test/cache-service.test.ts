import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { buildValidators, isNotModified } from "../src/cache-service";

let filePath = "";

before(async () => {
  const directory = await fs.mkdtemp(path.join(tmpdir(), "cache-service-test-"));
  filePath = path.join(directory, "file.txt");
  await fs.writeFile(filePath, "hello world");
});

after(async () => {
  await fs.rm(path.dirname(filePath), { recursive: true, force: true });
});

test("buildValidators derives a stable etag and Last-Modified from file stats", async () => {
  const stats = await fs.stat(filePath);
  const first = buildValidators(stats);
  const second = buildValidators(stats);
  assert.equal(first.etag, second.etag);
  assert.match(first.etag, /^"[0-9a-f]+-[0-9a-f]+"$/u);
  assert.equal(first.lastModified, stats.mtime.toUTCString());
});

test("isNotModified matches a strong or weak If-None-Match against the current etag", async () => {
  const stats = await fs.stat(filePath);
  const validators = buildValidators(stats);
  assert.equal(isNotModified({ "if-none-match": validators.etag }, validators, stats.mtimeMs), true);
  assert.equal(isNotModified({ "if-none-match": `W/${validators.etag}` }, validators, stats.mtimeMs), true);
  assert.equal(isNotModified({ "if-none-match": `"stale-etag", ${validators.etag}` }, validators, stats.mtimeMs), true);
  assert.equal(isNotModified({ "if-none-match": "*" }, validators, stats.mtimeMs), true);
  assert.equal(isNotModified({ "if-none-match": '"stale-etag"' }, validators, stats.mtimeMs), false);
});

test("isNotModified gives If-None-Match precedence over If-Modified-Since", async () => {
  const stats = await fs.stat(filePath);
  const validators = buildValidators(stats);
  const future = new Date(stats.mtimeMs + 60_000).toUTCString();
  assert.equal(
    isNotModified({ "if-none-match": '"stale-etag"', "if-modified-since": future }, validators, stats.mtimeMs),
    false,
  );
});

test("isNotModified compares If-Modified-Since at second granularity", async () => {
  const stats = await fs.stat(filePath);
  const validators = buildValidators(stats);
  const sameSecond = new Date(Math.floor(stats.mtimeMs / 1000) * 1000).toUTCString();
  const before = new Date(stats.mtimeMs - 60_000).toUTCString();
  assert.equal(isNotModified({ "if-modified-since": sameSecond }, validators, stats.mtimeMs), true);
  assert.equal(isNotModified({ "if-modified-since": before }, validators, stats.mtimeMs), false);
  assert.equal(isNotModified({ "if-modified-since": "not a date" }, validators, stats.mtimeMs), false);
});

test("isNotModified is false with no conditional headers", async () => {
  const stats = await fs.stat(filePath);
  const validators = buildValidators(stats);
  assert.equal(isNotModified({}, validators, stats.mtimeMs), false);
});
