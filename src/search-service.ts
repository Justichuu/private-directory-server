import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveVisibleEntry } from "./path-service";
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
  readonly rootDirectory: string;
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly query: string;
  readonly showHidden: boolean;
}): Promise<readonly DirectoryItem[]> {
  const normalizedQuery = options.query.trim().toLocaleLowerCase();
  if (normalizedQuery.length < 2) return [];
  const rootPath = await fs.realpath(options.rootDirectory).catch(() => null);
  if (rootPath === null) return [];
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
      const visible = await resolveVisibleEntry({
        rootDirectory: rootPath,
        directoryPath: current.absolutePath,
        entry,
        showHidden: options.showHidden,
      });
      if (visible === null) continue;
      const relativeEntryPath = [current.relativePath, visible.name].filter(Boolean).join("/");
      if (visible.name.toLocaleLowerCase().includes(normalizedQuery)) {
        results.push({
          name: visible.name,
          path: relativeEntryPath,
          type: visible.type,
          size: visible.size,
          modifiedAt: visible.modifiedAt.toISOString(),
        });
        if (results.length >= MAX_RESULTS) break;
      }
      if (visible.descend && current.depth < MAX_DEPTH) {
        pending.push({
          absolutePath: path.join(current.absolutePath, visible.name),
          relativePath: relativeEntryPath,
          depth: current.depth + 1,
        });
      }
    }
  }
  return results;
}
