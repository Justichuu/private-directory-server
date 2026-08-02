export type ByteRangeResult =
  | { readonly status: "full" }
  | { readonly status: "partial"; readonly start: number; readonly end: number }
  | { readonly status: "unsatisfiable" };

/** Parses one RFC 7233-style byte range. Multiple ranges are intentionally rejected. */
export function parseByteRange(rangeHeader: string | undefined, fileSize: number): ByteRangeResult {
  if (rangeHeader === undefined) return { status: "full" };
  const match = /^bytes=(\d*)-(\d*)$/u.exec(rangeHeader.trim());
  if (match === null || (match[1] === "" && match[2] === "")) return { status: "unsatisfiable" };
  const rawStart = match[1] ?? "";
  const rawEnd = match[2] ?? "";
  if (rawStart === "") {
    const suffixLength = Number(rawEnd);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0 || fileSize === 0) return { status: "unsatisfiable" };
    return { status: "partial", start: Math.max(fileSize - suffixLength, 0), end: fileSize - 1 };
  }
  const start = Number(rawStart);
  const requestedEnd = rawEnd === "" ? fileSize - 1 : Number(rawEnd);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start < 0 || start >= fileSize || requestedEnd < start) {
    return { status: "unsatisfiable" };
  }
  return { status: "partial", start, end: Math.min(requestedEnd, fileSize - 1) };
}
