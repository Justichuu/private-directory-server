import { createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { type IncomingMessage } from "node:http";
import { pipeline } from "node:stream/promises";

export class BodyLimitError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "BodyLimitError";
  }
}

/** Reads a request body up to an explicit byte limit and aborts oversized input. */
export async function readBody(request: IncomingMessage, maximumBytes: number): Promise<Buffer> {
  const declaredLength = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new BodyLimitError(`Request body exceeds the ${maximumBytes}-byte limit.`);
  }
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > maximumBytes) throw new BodyLimitError(`Request body exceeds the ${maximumBytes}-byte limit.`);
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, totalBytes);
}

async function* limitBytes(source: AsyncIterable<Buffer>, maximumBytes: number): AsyncGenerator<Buffer> {
  let totalBytes = 0;
  for await (const chunk of source) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as ArrayBufferLike);
    totalBytes += buffer.length;
    if (totalBytes > maximumBytes) throw new BodyLimitError(`Request body exceeds the ${maximumBytes}-byte limit.`);
    yield buffer;
  }
}

/**
 * Streams a request body directly to a new file, never buffering the whole
 * upload in memory. The file is created exclusively (fails if it already
 * exists) and any partial file is removed on failure, except when creation
 * itself failed because the target already existed.
 */
export async function streamBodyToFile(request: IncomingMessage, targetPath: string, maximumBytes: number): Promise<void> {
  const declaredLength = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new BodyLimitError(`Request body exceeds the ${maximumBytes}-byte limit.`);
  }
  const writeStream = createWriteStream(targetPath, { flags: "wx" });
  try {
    await pipeline(limitBytes(request, maximumBytes), writeStream);
  } catch (error: unknown) {
    const isExistingFile = typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
    if (!isExistingFile) await unlink(targetPath).catch(() => undefined);
    throw error;
  }
}

/** Parses a small JSON request body and reports malformed JSON explicitly. */
export async function readJsonBody(request: IncomingMessage, maximumBytes = 8_192): Promise<unknown> {
  const body = await readBody(request, maximumBytes);
  try {
    return JSON.parse(body.toString("utf8")) as unknown;
  } catch {
    throw new SyntaxError("Request body must be valid JSON.");
  }
}
