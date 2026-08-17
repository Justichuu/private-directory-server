import assert from "node:assert/strict";
import { test } from "node:test";
import { negotiateEncoding } from "../src/compression";

test("negotiateEncoding returns null when the client sends no Accept-Encoding header", () => {
  assert.equal(negotiateEncoding(undefined), null);
});

test("negotiateEncoding accepts a single supported encoding", () => {
  assert.equal(negotiateEncoding("gzip"), "gzip");
  assert.equal(negotiateEncoding("br"), "br");
});

test("negotiateEncoding prefers br over gzip on equal or higher quality", () => {
  assert.equal(negotiateEncoding("br, gzip"), "br");
  assert.equal(negotiateEncoding("br;q=0.5, gzip;q=0.5"), "br");
  assert.equal(negotiateEncoding("*;q=0.5"), "br");
});

test("negotiateEncoding falls back to gzip when it is weighted higher than br", () => {
  assert.equal(negotiateEncoding("gzip;q=0.8, br;q=0.3"), "gzip");
});

test("negotiateEncoding treats q=0 as a refusal", () => {
  assert.equal(negotiateEncoding("br;q=0"), null);
  assert.equal(negotiateEncoding("br;q=0, gzip;q=0"), null);
  assert.equal(negotiateEncoding("gzip;q=0, br;q=0.4"), "br");
});

test("negotiateEncoding does not treat identity or unrelated codings as br/gzip", () => {
  assert.equal(negotiateEncoding("identity"), null);
  assert.equal(negotiateEncoding("deflate"), null);
});

test("negotiateEncoding accepts a multi-value header array", () => {
  assert.equal(negotiateEncoding(["gzip;q=0.2", "br;q=0.9"]), "br");
});
