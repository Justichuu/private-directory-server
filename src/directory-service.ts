import { promises as fs } from "node:fs";
import path from "node:path";
import { type DirectoryItem } from "./types";

const STAT_CONCURRENCY = 32;
const NAME_COLLATOR = new Intl.Collator(undefined, { sensitivity: "base" });

/** Runs an async mapper over items with at most `limit` calls in flight at once. */
async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (item === undefined) continue;
      results[index] = await mapper(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Lists regular files and directories, omitting inaccessible entries. */
export async function listDirectory(options: {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly showHidden: boolean;
}): Promise<readonly DirectoryItem[]> {
  const entries = await fs.readdir(options.absolutePath, { withFileTypes: true });
  const visibleEntries = entries.filter(
    (entry) => (options.showHidden || !entry.name.startsWith(".")) && (entry.isDirectory() || entry.isFile()),
  );

  const items = await mapWithConcurrency(visibleEntries, STAT_CONCURRENCY, async (entry): Promise<DirectoryItem | null> => {
    const absoluteEntryPath = path.join(options.absolutePath, entry.name);
    const stats = await fs.stat(absoluteEntryPath).catch(() => null);
    if (stats === null) return null;
    const itemPath = [options.relativePath, entry.name].filter(Boolean).join("/");
    return {
      name: entry.name,
      path: itemPath,
      type: entry.isDirectory() ? "directory" : "file",
      size: stats.size,
      modifiedAt: stats.mtime.toISOString(),
    };
  });

  return items
    .filter((item): item is DirectoryItem => item !== null)
    .sort((left, right) => {
      if (left.type !== right.type) return left.type === "directory" ? -1 : 1;
      return NAME_COLLATOR.compare(left.name, right.name);
    });
}
