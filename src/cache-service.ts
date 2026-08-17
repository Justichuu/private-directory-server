import { type Stats } from "node:fs";
import { type IncomingHttpHeaders } from "node:http";

/** Cache validators for a single file, derived from its size and modification time. */
export interface CacheValidators {
  readonly etag: string;
  readonly lastModified: string;
}

/** Builds a strong-ish ETag and a Last-Modified header value from file stats. */
export function buildValidators(stats: Stats): CacheValidators {
  return {
    etag: `"${stats.size.toString(16)}-${Math.trunc(stats.mtimeMs).toString(16)}"`,
    lastModified: stats.mtime.toUTCString(),
  };
}

function matchesEtag(ifNoneMatch: string, etag: string): boolean {
  const candidates = ifNoneMatch.split(",").map((value) => value.trim());
  return candidates.some((candidate) => candidate === "*" || candidate.replace(/^W\//u, "") === etag);
}

/**
 * Decides whether a conditional GET/HEAD request already holds the current
 * representation. Per RFC 9110, If-None-Match takes precedence over
 * If-Modified-Since when both are present.
 */
export function isNotModified(headers: IncomingHttpHeaders, validators: CacheValidators, mtimeMs: number): boolean {
  const ifNoneMatch = headers["if-none-match"];
  if (typeof ifNoneMatch === "string") return matchesEtag(ifNoneMatch, validators.etag);

  const ifModifiedSince = headers["if-modified-since"];
  if (typeof ifModifiedSince === "string") {
    const since = Date.parse(ifModifiedSince);
    if (!Number.isNaN(since)) return Math.floor(mtimeMs / 1000) <= Math.floor(since / 1000);
  }

  return false;
}
