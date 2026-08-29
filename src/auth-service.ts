import { createHash, timingSafeEqual } from "node:crypto";
import { type IncomingMessage } from "node:http";

const SESSION_COOKIE = "pds_session";

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function safeEqual(left: string, right: string): boolean {
  return timingSafeEqual(digest(left), digest(right));
}

function readCookie(request: IncomingMessage, name: string): string | null {
  const cookieHeader = request.headers.cookie;
  if (cookieHeader === undefined) return null;
  for (const field of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = field.trim().split("=");
    if (rawName === name) return decodeURIComponent(rawValue.join("="));
  }
  return null;
}

/** Returns whether a request satisfies the configured bearer-token or session-cookie policy. */
export function isAuthenticated(request: IncomingMessage, accessToken: string | null): boolean {
  if (accessToken === null) return true;
  const authorization = request.headers.authorization;
  if (authorization?.startsWith("Bearer ") === true && safeEqual(authorization.slice(7), accessToken)) return true;
  const session = readCookie(request, SESSION_COOKIE);
  return session !== null && safeEqual(session, digest(accessToken).toString("hex"));
}

export function cookieSecurityFlags(secure: boolean): string {
  return `HttpOnly; SameSite=Strict; Path=/${secure ? "; Secure" : ""}`;
}

/** True when the operator forced Secure cookies or the request arrived over TLS. */
export function shouldUseSecureCookie(request: IncomingMessage, cookieSecure: boolean): boolean {
  if (cookieSecure) return true;
  const forwarded = request.headers["x-forwarded-proto"];
  const proto = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim().toLowerCase();
  if (proto === "https") return true;
  return Boolean((request.socket as { encrypted?: boolean }).encrypted);
}

/** Creates an opaque, HTTP-only browser session cookie derived from the configured token. */
export function createSessionCookie(accessToken: string, secure = false): string {
  return `${SESSION_COOKIE}=${digest(accessToken).toString("hex")}; ${cookieSecurityFlags(secure)}; Max-Age=86400`;
}

/** Clears the browser session cookie. */
export function clearSessionCookie(secure = false): string {
  return `${SESSION_COOKIE}=; ${cookieSecurityFlags(secure)}; Max-Age=0`;
}

/** Compares a submitted login token without leaking its length or mismatch position. */
export function verifyAccessToken(submittedToken: string, accessToken: string): boolean {
  return safeEqual(submittedToken, accessToken);
}
