import { promises as fs } from "node:fs";
import path from "node:path";
import { type DirectoryItem } from "./types";

const MAX_RESULTS = 200;
const MAX_DEPTH = 20;
const MAX_SCANNED_ENTRIES = 10_000;

interface SearchDirectory {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly depth: number;
}

/** Recursively searches accessible names without following symbolic links. */
export async function searchDirectory(options: {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly query: string;
  readonly showHidden: boolean;
}): Promise<readonly DirectoryItem[]> {
  const normalizedQuery = options.query.trim().toLocaleLowerCase();
  if (normalizedQuery.length < 2) return [];
  const pending: SearchDirectory[] = [{ absolutePath: options.absolutePath, relativePath: options.relativePath, depth: 0 }];
  const results: DirectoryItem[] = [];
  let scannedEntries = 0;

  while (pending.length > 0 && results.length < MAX_RESULTS && scannedEntries < MAX_SCANNED_ENTRIES) {
    const current = pending.shift();
    if (current === undefined) break;
    const entries = await fs.readdir(current.absolutePath, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      scannedEntries += 1;
      if (scannedEntries > MAX_SCANNED_ENTRIES) break;
      if ((!options.showHidden && entry.name.startsWith(".")) || (!entry.isFile() && !entry.isDirectory())) continue;
      const absoluteEntryPath = path.join(current.absolutePath, entry.name);
      const relativeEntryPath = [current.relativePath, entry.name].filter(Boolean).join("/");
      const stats = await fs.stat(absoluteEntryPath).catch(() => null);
      if (stats === null) continue;
      if (entry.name.toLocaleLowerCase().includes(normalizedQuery)) {
        results.push({
          name: entry.name,
          path: relativeEntryPath,
          type: entry.isDirectory() ? "directory" : "file",
          size: stats.size,
          modifiedAt: stats.mtime.toISOString(),
        });
        if (results.length >= MAX_RESULTS) break;
      }
      if (entry.isDirectory() && current.depth < MAX_DEPTH) {
        pending.push({ absolutePath: absoluteEntryPath, relativePath: relativeEntryPath, depth: current.depth + 1 });
      }
    }
  }
  return results;
}
