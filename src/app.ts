import { createReadStream, promises as fs } from "node:fs";
import { type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { clearSessionCookie, createSessionCookie, isAuthenticated, verifyAccessToken } from "./auth-service";
import { getContentType } from "./content-types";
import { listDirectory } from "./directory-service";
import { securityHeaders, sendError, sendJson } from "./http-utils";
import { resolveSafePath } from "./path-service";
import { parseByteRange } from "./range-service";
import { BodyLimitError, readBody, readJsonBody } from "./request-body";
import { searchDirectory } from "./search-service";
import { type ServerConfig, type SessionInfo } from "./types";

function getRequestUrl(request: IncomingMessage): URL | null {
  try { return new URL(request.url ?? "/", "http://localhost"); } catch { return null; }
}

function sendUnauthorized(response: ServerResponse): void {
  response.setHeader("WWW-Authenticate", "Bearer realm=\"Private Directory Server\"");
  sendJson(response, 401, { error: "Authentication required." });
}

function addRequestLogging(request: IncomingMessage, response: ServerResponse, enabled: boolean): void {
  if (!enabled) return;
  const startedAt = performance.now();
  response.once("finish", () => {
    const elapsed = Math.round(performance.now() - startedAt);
    const pathname = getRequestUrl(request)?.pathname ?? "<invalid>";
    console.log(`${request.socket.remoteAddress ?? "unknown"} ${request.method ?? "UNKNOWN"} ${pathname} ${response.statusCode} ${elapsed}ms`);
  });
}

async function serveFile(options: {
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
  readonly filePath: string;
  readonly disposition: "attachment" | "inline";
}): Promise<void> {
  const stats = await fs.stat(options.filePath).catch(() => null);
  if (stats === null || !stats.isFile()) return sendError(options.response, 404, "File not found.");
  const range = parseByteRange(options.request.headers.range, stats.size);
  if (range.status === "unsatisfiable") {
    options.response.writeHead(416, { ...securityHeaders(), "Content-Range": `bytes */${stats.size}` });
    options.response.end();
    return;
  }
  const start = range.status === "partial" ? range.start : 0;
  const end = range.status === "partial" ? range.end : Math.max(stats.size - 1, 0);
  const contentLength = stats.size === 0 ? 0 : end - start + 1;
  const safeName = path.basename(options.filePath).replace(/["\r\n]/gu, "_");
  const headers: Record<string, string | number> = {
    ...securityHeaders(),
    "Accept-Ranges": "bytes",
    "Content-Disposition": `${options.disposition}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
    "Content-Length": contentLength,
    "Content-Type": getContentType(options.filePath),
  };
  if (range.status === "partial") headers["Content-Range"] = `bytes ${start}-${end}/${stats.size}`;
  options.response.writeHead(range.status === "partial" ? 206 : 200, headers);
  if (options.request.method === "HEAD" || stats.size === 0) {
    options.response.end();
    return;
  }
  const stream = createReadStream(options.filePath, { start, end });
  stream.on("error", () => options.response.destroy());
  stream.pipe(options.response);
}

async function resolveDirectory(url: URL, config: ServerConfig): Promise<Awaited<ReturnType<typeof resolveSafePath>>> {
  return resolveSafePath({ rootDirectory: config.rootDirectory, requestedPath: url.searchParams.get("path") ?? "", showHidden: config.showHidden });
}

async function serveListing(response: ServerResponse, url: URL, config: ServerConfig): Promise<void> {
  const resolution = await resolveDirectory(url, config);
  if (resolution.status !== "resolved") return sendJson(response, resolution.status === "forbidden" ? 403 : 404, { error: resolution.reason });
  const stats = await fs.stat(resolution.absolutePath);
  if (!stats.isDirectory()) return sendJson(response, 400, { error: "The requested path is not a directory." });
  const items = await listDirectory({ absolutePath: resolution.absolutePath, relativePath: resolution.relativePath, showHidden: config.showHidden });
  sendJson(response, 200, { path: resolution.relativePath, items });
}

async function serveSearch(response: ServerResponse, url: URL, config: ServerConfig): Promise<void> {
  const query = (url.searchParams.get("q") ?? "").trim();
  if (query.length < 2) return sendJson(response, 400, { error: "Search requires at least two characters." });
  const resolution = await resolveDirectory(url, config);
  if (resolution.status !== "resolved") return sendJson(response, resolution.status === "forbidden" ? 403 : 404, { error: resolution.reason });
  const items = await searchDirectory({ absolutePath: resolution.absolutePath, relativePath: resolution.relativePath, query, showHidden: config.showHidden });
  sendJson(response, 200, { path: resolution.relativePath, query, items });
}

async function serveSharedFile(request: IncomingMessage, response: ServerResponse, requestedPath: string, config: ServerConfig, disposition: "attachment" | "inline"): Promise<void> {
  const resolution = await resolveSafePath({ rootDirectory: config.rootDirectory, requestedPath, showHidden: config.showHidden });
  if (resolution.status !== "resolved") return sendError(response, resolution.status === "forbidden" ? 403 : 404, resolution.reason);
  await serveFile({ request, response, filePath: resolution.absolutePath, disposition });
}

async function handleLogin(request: IncomingMessage, response: ServerResponse, config: ServerConfig): Promise<void> {
  if (config.accessToken === null) return sendJson(response, 200, { ok: true });
  try {
    const payload = await readJsonBody(request);
    const submittedToken = typeof payload === "object" && payload !== null && "token" in payload && typeof payload.token === "string" ? payload.token : null;
    if (submittedToken === null || !verifyAccessToken(submittedToken, config.accessToken)) return sendJson(response, 401, { error: "Invalid access token." });
    response.setHeader("Set-Cookie", createSessionCookie(config.accessToken));
    sendJson(response, 200, { ok: true });
  } catch (error: unknown) {
    sendJson(response, error instanceof BodyLimitError ? 413 : 400, { error: error instanceof Error ? error.message : "Invalid login request." });
  }
}

async function handleUpload(request: IncomingMessage, response: ServerResponse, url: URL, config: ServerConfig): Promise<void> {
  if (config.accessMode !== "upload") return sendJson(response, 403, { error: "Uploads are disabled." });
  const requestedPath = (url.searchParams.get("path") ?? "").replace(/\\/gu, "/");
  if (requestedPath === "") return sendJson(response, 400, { error: "Upload path is required." });
  const parentResolution = await resolveSafePath({ rootDirectory: config.rootDirectory, requestedPath: path.posix.dirname(requestedPath), showHidden: config.showHidden });
  if (parentResolution.status !== "resolved") return sendJson(response, parentResolution.status === "forbidden" ? 403 : 404, { error: parentResolution.reason });
  const fileName = path.posix.basename(requestedPath);
  if (fileName === "." || fileName === ".." || (!config.showHidden && fileName.startsWith("."))) return sendJson(response, 403, { error: "Upload path is not allowed." });
  const targetPath = path.join(parentResolution.absolutePath, fileName);
  try {
    const body = await readBody(request, config.maxUploadBytes);
    await fs.writeFile(targetPath, body, { flag: "wx" });
    sendJson(response, 201, { ok: true, path: [parentResolution.relativePath, fileName].filter(Boolean).join("/") });
  } catch (error: unknown) {
    if (error instanceof BodyLimitError) return sendJson(response, 413, { error: error.message });
    if (typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST") return sendJson(response, 409, { error: "A file already exists at that path." });
    throw error;
  }
}

async function servePublicAsset(request: IncomingMessage, response: ServerResponse, urlPath: string, config: ServerConfig): Promise<void> {
  const assetName = urlPath === "/" ? "index.html" : urlPath.slice("/assets/".length);
  if (assetName.includes("/") || assetName.includes("\\") || assetName.startsWith(".")) return sendError(response, 404, "Asset not found.");
  await serveFile({ request, response, filePath: path.join(config.publicDirectory, assetName), disposition: "inline" });
}

function sessionInfo(request: IncomingMessage, config: ServerConfig): SessionInfo {
  return { authenticated: isAuthenticated(request, config.accessToken), authenticationRequired: config.accessToken !== null, accessMode: config.accessMode, maxUploadBytes: config.maxUploadBytes };
}

/** Creates the authenticated request handler for one immutable server configuration. */
export function createRequestHandler(config: ServerConfig): (request: IncomingMessage, response: ServerResponse) => void {
  return (request, response): void => {
    addRequestLogging(request, response, config.logRequests);
    void (async (): Promise<void> => {
      const url = getRequestUrl(request);
      if (url === null) return sendError(response, 400, "Invalid request URL.");
      if (url.pathname === "/api/health" && request.method === "GET") return sendJson(response, 200, { status: "ready" });
      if (url.pathname === "/api/session" && request.method === "GET") return sendJson(response, 200, sessionInfo(request, config));
      if (url.pathname === "/api/session" && request.method === "POST") return handleLogin(request, response, config);
      if (url.pathname === "/api/session" && request.method === "DELETE") {
        response.setHeader("Set-Cookie", clearSessionCookie());
        return sendJson(response, 200, { ok: true });
      }
      if (url.pathname === "/" || url.pathname.startsWith("/assets/")) return servePublicAsset(request, response, url.pathname, config);
      if (!isAuthenticated(request, config.accessToken)) return sendUnauthorized(response);
      if (url.pathname === "/api/files" && request.method === "GET") return serveListing(response, url, config);
      if (url.pathname === "/api/search" && request.method === "GET") return serveSearch(response, url, config);
      if (url.pathname === "/api/files" && request.method === "POST") return handleUpload(request, response, url, config);
      if (url.pathname.startsWith("/files/") && (request.method === "GET" || request.method === "HEAD")) return serveSharedFile(request, response, url.pathname.slice(7), config, "attachment");
      if (url.pathname.startsWith("/view/") && (request.method === "GET" || request.method === "HEAD")) return serveSharedFile(request, response, url.pathname.slice(6), config, "inline");
      response.setHeader("Allow", "GET, HEAD, POST, DELETE");
      sendError(response, request.method === "GET" || request.method === "HEAD" ? 404 : 405, request.method === "GET" || request.method === "HEAD" ? "Route not found." : "Method not allowed.");
    })().catch((error: unknown) => {
      console.error("Request failed", error);
      if (!response.headersSent) sendError(response, 500, "Internal server error."); else response.destroy();
    });
  };
}
