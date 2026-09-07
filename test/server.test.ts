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
    cookieSecure: false,
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

test("rate-limits repeated failed browser logins from the same client", async () => {
  const token = "this-is-a-strong-test-token";
  const started = await startServer(createConfig({ accessToken: token }));
  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failed = await fetch(`${started.baseUrl}/api/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "wrong-token-value" }),
      });
      assert.equal(failed.status, 401);
    }
    const blocked = await fetch(`${started.baseUrl}/api/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    assert.equal(blocked.status, 429);
    assert.match(blocked.headers.get("retry-after") ?? "", /^[1-9]\d*$/u);
  } finally {
    await stopServer(started.server);
  }
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
    assert.doesNotMatch(cookie, /Secure/u);
    const session = await fetch(`${started.baseUrl}/api/files`, { headers: { Cookie: cookie.split(";")[0] ?? "" } });
    assert.equal(session.status, 200);
    const proxied = await fetch(`${started.baseUrl}/api/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-Proto": "https" },
      body: JSON.stringify({ token }),
    });
    assert.match(proxied.headers.get("set-cookie") ?? "", /Secure/u);
    const forced = await startServer(createConfig({ accessToken: token, cookieSecure: true }));
    try {
      const secureLogin = await fetch(`${forced.baseUrl}/api/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      assert.match(secureLogin.headers.get("set-cookie") ?? "", /Secure/u);
    } finally {
      await stopServer(forced.server);
    }
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

test("does not treat a malformed session cookie as a server error", async () => {
  const started = await startServer(createConfig({ accessToken: "this-is-a-strong-test-token" }));
  try {
    const response = await fetch(`${started.baseUrl}/api/files`, { headers: { Cookie: "pds_session=%E0%A4%A" } });
    assert.equal(response.status, 401);
  } finally {
    await stopServer(started.server);
  }
});

test("rejects search when the path is a file", async () => {
  const response = await fetch(`${baseUrl}/api/search?path=${encodeURIComponent("hello.txt")}&q=he`);
  assert.equal(response.status, 400);
});

test("blocks symbolic links whose real target is outside the shared root", async (t) => {
  const isolatedRoot = await fs.mkdtemp(path.join(tmpdir(), "private-directory-server-links-"));
  const outsideDirectory = await fs.mkdtemp(path.join(tmpdir(), "private-directory-server-outside-"));
  const insideFile = path.join(isolatedRoot, "hello.txt");
  const outsideFile = path.join(outsideDirectory, "secret.txt");
  const escapeLink = path.join(isolatedRoot, "escape-link");
  const aliasLink = path.join(isolatedRoot, "hello-alias");
  await fs.writeFile(insideFile, "hello world");
  await fs.writeFile(outsideFile, "should-not-be-readable");
  try {
    await fs.symlink(outsideFile, escapeLink);
    await fs.symlink(insideFile, aliasLink);
  } catch {
    t.skip("symbolic links are not available on this platform");
    await fs.rm(isolatedRoot, { recursive: true, force: true });
    await fs.rm(outsideDirectory, { recursive: true, force: true });
    return;
  }
  const started = await startServer(createConfig({ rootDirectory: isolatedRoot }));
  try {
    const escaped = await fetch(`${started.baseUrl}/files/escape-link`);
    assert.equal(escaped.status, 403);
    assert.equal(await fs.readFile(outsideFile, "utf8"), "should-not-be-readable");
    const listing = await fetch(`${started.baseUrl}/api/files`);
    const payload = await listing.json() as { items: ReadonlyArray<{ name: string }> };
    assert.equal(payload.items.some((item) => item.name === "escape-link"), false);
    const aliased = await fetch(`${started.baseUrl}/files/hello-alias`);
    assert.equal(aliased.status, 200);
    assert.equal(await aliased.text(), "hello world");
    await fs.writeFile(path.join(isolatedRoot, ".secret"), "hidden");
    await fs.writeFile(path.join(outsideDirectory, "unique-outside-needle.txt"), "outside");
    await fs.symlink(path.join(isolatedRoot, ".secret"), path.join(isolatedRoot, "visible-secret"));
    await fs.symlink(outsideDirectory, path.join(isolatedRoot, "outside-dir"));
    const hiddenAlias = await fetch(`${started.baseUrl}/files/visible-secret`);
    assert.equal(hiddenAlias.status, 403);
    const leaked = await fetch(`${started.baseUrl}/api/search?q=unique-outside-needle`);
    const leakedPayload = await leaked.json() as { items: ReadonlyArray<{ name: string }> };
    assert.deepEqual(leakedPayload.items, []);
  } finally {
    await stopServer(started.server);
    await fs.rm(isolatedRoot, { recursive: true, force: true });
    await fs.rm(outsideDirectory, { recursive: true, force: true });
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
