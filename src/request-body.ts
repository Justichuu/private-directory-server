import { type IncomingMessage } from "node:http";

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

/** Parses a small JSON request body and reports malformed JSON explicitly. */
export async function readJsonBody(request: IncomingMessage, maximumBytes = 8_192): Promise<unknown> {
  const body = await readBody(request, maximumBytes);
  try {
    return JSON.parse(body.toString("utf8")) as unknown;
  } catch {
    throw new SyntaxError("Request body must be valid JSON.");
  }
}
