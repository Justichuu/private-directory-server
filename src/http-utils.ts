import { type ServerResponse } from "node:http";

const SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'self'; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
} as const;

/** Writes a JSON response with security and cache headers. */
export function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, {
    ...SECURITY_HEADERS,
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
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
