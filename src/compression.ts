import { createBrotliCompress, createGzip, constants as zlibConstants } from "node:zlib";
import { type Transform } from "node:stream";

// Default brotli quality (11) is far too slow to run on every request; a mid-range
// quality keeps CPU cost low while still beating gzip's ratio.
export const DYNAMIC_BROTLI_QUALITY = 4;

interface EncodingPreference {
  readonly name: string;
  readonly quality: number;
}

function parseAcceptEncoding(headerValue: string): readonly EncodingPreference[] {
  return headerValue
    .split(",")
    .map((token): EncodingPreference | null => {
      const [rawName, ...parameters] = token.trim().split(";").map((part) => part.trim());
      if (rawName === undefined || rawName === "") return null;
      const qualityParameter = parameters.find((parameter) => parameter.toLowerCase().startsWith("q="));
      const quality = qualityParameter === undefined ? 1 : Number(qualityParameter.slice(2));
      return { name: rawName.toLowerCase(), quality: Number.isFinite(quality) ? quality : 0 };
    })
    .filter((preference): preference is EncodingPreference => preference !== null);
}

function qualityFor(preferences: readonly EncodingPreference[], name: string): number {
  const explicit = preferences.find((preference) => preference.name === name);
  if (explicit !== undefined) return explicit.quality;
  const wildcard = preferences.find((preference) => preference.name === "*");
  return wildcard?.quality ?? 0;
}

/**
 * Picks the best compressible encoding for a response from a request's
 * Accept-Encoding header. Non-identity codings are unacceptable by default
 * (RFC 9110 §12.5.3) unless named explicitly or covered by "*"; q=0 refuses.
 */
export function negotiateEncoding(headerValue: string | string[] | undefined): "br" | "gzip" | null {
  if (headerValue === undefined) return null;
  const combined = Array.isArray(headerValue) ? headerValue.join(",") : headerValue;
  const preferences = parseAcceptEncoding(combined);
  const brotliQuality = qualityFor(preferences, "br");
  const gzipQuality = qualityFor(preferences, "gzip");
  if (brotliQuality > 0 && brotliQuality >= gzipQuality) return "br";
  if (gzipQuality > 0) return "gzip";
  return null;
}

/** Creates a streaming compressor for the given negotiated encoding. */
export function createCompressionStream(encoding: "br" | "gzip"): Transform {
  return encoding === "br"
    ? createBrotliCompress({ params: { [zlibConstants.BROTLI_PARAM_QUALITY]: DYNAMIC_BROTLI_QUALITY } })
    : createGzip({ level: 6 });
}
