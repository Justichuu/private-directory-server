import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { createRequestHandler } from "../src/app";
import { type ServerConfig } from "../src/types";

let rootDirectory = "";
let publicDirectory = "";
let baseUrl = "";
let server: Server;

function createConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    rootDirectory,
    publicDirectory,
    host: "127.0.0.1",
    port: 0,
    showHidden: false,
    accessToken: null,
    accessMode: "read-only",
    logRequests: false,
    maxUploadBytes: 1024,
    ...overrides,
  };
}

async function startServer(config: ServerConfig): Promise<{ readonly server: Server; readonly baseUrl: string }> {
  const instance = createServer(createRequestHandler(config));
  await new Promise<void>((resolve) => instance.listen(0, "127.0.0.1", resolve));
  const address = instance.address();
  if (typeof address !== "object" || address === null) throw new Error("Test server did not bind to TCP.");
  return { server: instance, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function stopServer(instance: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => instance.close((error) => error === undefined ? resolve() : reject(error)));
}

before(async () => {
  rootDirectory = await fs.mkdtemp(path.join(tmpdir(), "private-directory-server-root-"));
  publicDirectory = await fs.mkdtemp(path.join(tmpdir(), "private-directory-server-public-"));
  await fs.mkdir(path.join(rootDirectory, "nested"));
  await fs.writeFile(path.join(rootDirectory, "hello.txt"), "hello world");
  await fs.writeFile(path.join(rootDirectory, "nested", "needle-notes.txt"), "search result");
  await fs.writeFile(path.join(rootDirectory, ".secret"), "hidden");
  await fs.writeFile(path.join(publicDirectory, "index.html"), "<!doctype html><title>Test UI</title>");
  const started = await startServer(createConfig());
  server = started.server;
  baseUrl = started.baseUrl;
});

after(async () => {
  await stopServer(server);
  await fs.rm(rootDirectory, { recursive: true, force: true });
  await fs.rm(publicDirectory, { recursive: true, force: true });
});

test("serves the browser and health endpoint", async () => {
  const [page, health] = await Promise.all([fetch(`${baseUrl}/`), fetch(`${baseUrl}/api/health`)]);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Test UI/u);
  assert.deepEqual(await health.json(), { status: "ready" });
});

test("lists directories before files and hides dotfiles", async () => {
  const response = await fetch(`${baseUrl}/api/files`);
  assert.equal(response.status, 200);
  const payload = await response.json() as { items: ReadonlyArray<{ name: string; type: string }> };
  assert.deepEqual(payload.items.map(({ name, type }) => ({ name, type })), [
    { name: "nested", type: "directory" },
    { name: "hello.txt", type: "file" },
  ]);
});

test("downloads a file with safe headers", async () => {
  const response = await fetch(`${baseUrl}/files/hello.txt`);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "hello world");
  assert.match(response.headers.get("content-disposition") ?? "", /attachment/u);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
});

test("serves valid byte ranges and rejects invalid ranges", async () => {
  const partial = await fetch(`${baseUrl}/view/hello.txt`, { headers: { Range: "bytes=6-10" } });
  assert.equal(partial.status, 206);
  assert.equal(partial.headers.get("content-range"), "bytes 6-10/11");
  assert.equal(await partial.text(), "world");
  const suffix = await fetch(`${baseUrl}/view/hello.txt`, { headers: { Range: "bytes=-5" } });
  assert.equal(await suffix.text(), "world");
  const invalid = await fetch(`${baseUrl}/view/hello.txt`, { headers: { Range: "bytes=99-100" } });
  assert.equal(invalid.status, 416);
  assert.equal(invalid.headers.get("content-range"), "bytes */11");
});

test("searches recursively without exposing hidden files", async () => {
  const response = await fetch(`${baseUrl}/api/search?q=needle`);
  assert.equal(response.status, 200);
  const payload = await response.json() as { items: ReadonlyArray<{ path: string }> };
  assert.deepEqual(payload.items.map((item) => item.path), ["nested/needle-notes.txt"]);
});

test("requires authentication and establishes an HTTP-only session", async () => {
  const token = "this-is-a-strong-test-token";
  const started = await startServer(createConfig({ accessToken: token }));
  try {
    assert.equal((await fetch(`${started.baseUrl}/api/files`)).status, 401);
    const bearer = await fetch(`${started.baseUrl}/api/files`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(bearer.status, 200);
    const login = await fetch(`${started.baseUrl}/api/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie") ?? "";
    assert.match(cookie, /HttpOnly/u);
    assert.match(cookie, /SameSite=Strict/u);
    const session = await fetch(`${started.baseUrl}/api/files`, { headers: { Cookie: cookie.split(";")[0] ?? "" } });
    assert.equal(session.status, 200);
  } finally {
    await stopServer(started.server);
  }
});

test("supports bounded, non-overwriting uploads only when enabled", async () => {
  const started = await startServer(createConfig({ accessMode: "upload", maxUploadBytes: 12 }));
  try {
    const upload = await fetch(`${started.baseUrl}/api/files?path=uploaded.txt`, { method: "POST", body: "new content" });
    assert.equal(upload.status, 201);
    assert.equal(await fs.readFile(path.join(rootDirectory, "uploaded.txt"), "utf8"), "new content");
    const duplicate = await fetch(`${started.baseUrl}/api/files?path=uploaded.txt`, { method: "POST", body: "replace" });
    assert.equal(duplicate.status, 409);
    const oversized = await fetch(`${started.baseUrl}/api/files?path=large.txt`, { method: "POST", body: "content over limit" });
    assert.equal(oversized.status, 413);
    const escaped = await fetch(`${started.baseUrl}/api/files?path=${encodeURIComponent("..\\outside.txt")}`, { method: "POST", body: "escape" });
    assert.equal(escaped.status, 403);
    assert.equal(await fs.stat(path.join(rootDirectory, "..", "outside.txt")).then(() => true).catch(() => false), false);
  } finally {
    await stopServer(started.server);
    await fs.rm(path.join(rootDirectory, "uploaded.txt"), { force: true });
  }
});

test("blocks traversal, hidden files, and unsupported methods", async () => {
  const [traversal, hidden, post] = await Promise.all([
    fetch(`${baseUrl}/api/files?path=${encodeURIComponent("../")}`),
    fetch(`${baseUrl}/files/.secret`),
    fetch(`${baseUrl}/api/files`, { method: "POST" }),
  ]);
  assert.equal(traversal.status, 403);
  assert.equal(hidden.status, 403);
  assert.equal(post.status, 403);
});

test("returns 304 with matching validators for a conditional GET", async () => {
  const first = await fetch(`${baseUrl}/files/hello.txt`);
  const etag = first.headers.get("etag");
  assert.notEqual(etag, null);
  const conditional = await fetch(`${baseUrl}/files/hello.txt`, { headers: { "If-None-Match": etag ?? "" } });
  assert.equal(conditional.status, 304);
  assert.equal(await conditional.text(), "");
  assert.equal(conditional.headers.get("etag"), etag);
});

test("compresses a large JSON listing and advertises Vary: Accept-Encoding", async () => {
  const bigDirectory = await fs.mkdtemp(path.join(tmpdir(), "private-directory-server-big-"));
  try {
    await Promise.all(Array.from({ length: 100 }, (_, index) =>
      fs.writeFile(path.join(bigDirectory, `file-${index}-with-a-reasonably-long-descriptive-name.txt`), "x")));
    const started = await startServer(createConfig({ rootDirectory: bigDirectory }));
    try {
      const response = await fetch(`${started.baseUrl}/api/files`, { headers: { "Accept-Encoding": "gzip, br" } });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-encoding"), "br");
      assert.equal(response.headers.get("vary"), "Accept-Encoding");
      const payload = await response.json() as { items: readonly unknown[] };
      assert.equal(payload.items.length, 100);
    } finally {
      await stopServer(started.server);
    }
  } finally {
    await fs.rm(bigDirectory, { recursive: true, force: true });
  }
});

test("never compresses a Range response even when the client accepts compression", async () => {
  const bigDirectory = await fs.mkdtemp(path.join(tmpdir(), "private-directory-server-range-"));
  try {
    await fs.writeFile(path.join(bigDirectory, "large.txt"), "abcdefghij".repeat(200));
    const started = await startServer(createConfig({ rootDirectory: bigDirectory }));
    try {
      const full = await fetch(`${started.baseUrl}/view/large.txt`, { headers: { "Accept-Encoding": "br, gzip" } });
      assert.equal(full.headers.get("content-encoding"), "br");
      const ranged = await fetch(`${started.baseUrl}/view/large.txt`, { headers: { "Accept-Encoding": "br, gzip", Range: "bytes=0-4" } });
      assert.equal(ranged.status, 206);
      assert.equal(ranged.headers.get("content-encoding"), null);
      assert.equal(await ranged.text(), "abcde");
    } finally {
      await stopServer(started.server);
    }
  } finally {
    await fs.rm(bigDirectory, { recursive: true, force: true });
  }
});

test("leaves no partial file when a streamed upload exceeds the byte limit mid-stream", async () => {
  const started = await startServer(createConfig({ accessMode: "upload", maxUploadBytes: 8 }));
  try {
    let sentBytes = 0;
    const overflowingBody = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sentBytes >= 40) { controller.close(); return; }
        controller.enqueue(new TextEncoder().encode("aaaa"));
        sentBytes += 4;
      },
    });
    const response = await fetch(`${started.baseUrl}/api/files?path=streamed-oversized.bin`, {
      method: "POST",
      body: overflowingBody,
      duplex: "half",
    } as RequestInit);
    assert.equal(response.status, 413);
    const exists = await fs.stat(path.join(rootDirectory, "streamed-oversized.bin")).then(() => true).catch(() => false);
    assert.equal(exists, false);
  } finally {
    await stopServer(started.server);
  }
});
