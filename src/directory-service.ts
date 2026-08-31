import { promises as fs } from "node:fs";
import path from "node:path";
import { type DirectoryItem } from "./types";

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

  const items = await Promise.all(
    visibleEntries.map(async (entry): Promise<DirectoryItem | null> => {
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
    }),
  );

  return items
    .filter((item): item is DirectoryItem => item !== null)
    .sort((left, right) => {
      if (left.type !== right.type) return left.type === "directory" ? -1 : 1;
      return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
    });
}
