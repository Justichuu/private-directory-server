import { promises as fs } from "node:fs";
import { resolveVisibleEntry } from "./path-service";
import { type DirectoryItem } from "./types";

/** Lists regular files, directories, and symbolic links whose real target stays in-root. */
export async function listDirectory(options: {
  readonly rootDirectory: string;
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly showHidden: boolean;
}): Promise<readonly DirectoryItem[]> {
  const rootPath = await fs.realpath(options.rootDirectory).catch(() => null);
  if (rootPath === null) return [];
  const entries = await fs.readdir(options.absolutePath, { withFileTypes: true });
  const items = await Promise.all(
    entries.map(async (entry): Promise<DirectoryItem | null> => {
      const visible = await resolveVisibleEntry({
        rootDirectory: rootPath,
        directoryPath: options.absolutePath,
        entry,
        showHidden: options.showHidden,
      });
      if (visible === null) return null;
      return {
        name: visible.name,
        path: [options.relativePath, visible.name].filter(Boolean).join("/"),
        type: visible.type,
        size: visible.size,
        modifiedAt: visible.modifiedAt.toISOString(),
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
