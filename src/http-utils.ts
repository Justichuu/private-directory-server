import { type ServerResponse } from "node:http";
import { brotliCompress, constants as zlibConstants, gzip } from "node:zlib";
import { DYNAMIC_BROTLI_QUALITY, negotiateEncoding } from "./compression";

const SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'self'; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
} as const;

// Compressing a payload this small costs more latency (zlib call, event-loop round trip)
// than the smaller body saves on the wire.
export const COMPRESSIBLE_THRESHOLD_BYTES = 1024;

function writeJsonBody(response: ServerResponse, statusCode: number, body: Buffer, encoding: "br" | "gzip" | null): void {
  const headers: Record<string, string | number> = {
    ...SECURITY_HEADERS,
    "Cache-Control": "no-store",
    "Content-Length": body.length,
    "Content-Type": "application/json; charset=utf-8",
  };
  if (encoding !== null) {
    headers["Content-Encoding"] = encoding;
    headers["Vary"] = "Accept-Encoding";
  }
  response.writeHead(statusCode, headers);
  response.end(body);
}

/** Writes a JSON response with security and cache headers, compressing large payloads when the client accepts it. */
export function sendJson(response: ServerResponse, statusCode: number, payload: unknown, acceptEncoding?: string | string[]): void {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  const encoding = body.length >= COMPRESSIBLE_THRESHOLD_BYTES ? negotiateEncoding(acceptEncoding) : null;
  if (encoding === null) {
    writeJsonBody(response, statusCode, body, null);
    return;
  }

  const onCompressed = (error: Error | null, compressed: Buffer): void => {
    if (response.writableEnded) return;
    if (error !== null) {
      writeJsonBody(response, statusCode, body, null);
      return;
    }
    writeJsonBody(response, statusCode, compressed, encoding);
  };
  if (encoding === "br") {
    brotliCompress(body, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: DYNAMIC_BROTLI_QUALITY } }, onCompressed);
  } else {
    gzip(body, { level: 6 }, onCompressed);
  }
}

/** Writes a plain-text error response without exposing internal error details. */
export function sendError(response: ServerResponse, statusCode: number, message: string): void {
  response.writeHead(statusCode, {
    ...SECURITY_HEADERS,
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8",
  });
  response.end(message);
}

export function securityHeaders(): Readonly<Record<string, string>> {
  return SECURITY_HEADERS;
}
