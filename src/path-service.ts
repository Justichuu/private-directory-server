import { promises as fs, type Dirent } from "node:fs";
import path from "node:path";
import { type PathResolution } from "./types";

export function containsHiddenSegment(relativePath: string): boolean {
  return relativePath
    .split(/[\\/]/u)
    .filter(Boolean)
    .some((segment) => segment.startsWith("."));
}

export function isWithinRoot(rootPath: string, candidatePath: string): boolean {
  const relative = path.relative(rootPath, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/** Lists a directory entry when it is a regular file/directory or an in-root symlink. */
export async function resolveVisibleEntry(options: {
  readonly rootDirectory: string;
  readonly directoryPath: string;
  readonly entry: Dirent;
  readonly showHidden: boolean;
}): Promise<{
  readonly name: string;
  readonly type: "directory" | "file";
  readonly size: number;
  readonly modifiedAt: Date;
  readonly descend: boolean;
} | null> {
  if (!options.showHidden && options.entry.name.startsWith(".")) return null;
  const absoluteEntryPath = path.join(options.directoryPath, options.entry.name);
  const linkStats = await fs.lstat(absoluteEntryPath).catch(() => null);
  if (linkStats === null) return null;
  const realPath = await fs.realpath(absoluteEntryPath).catch(() => null);
  if (realPath === null || !isWithinRoot(options.rootDirectory, realPath)) return null;
  const publishedRelative = path.relative(options.rootDirectory, realPath).split(path.sep).join("/");
  if (!options.showHidden && containsHiddenSegment(publishedRelative)) return null;
  const stats = await fs.stat(realPath).catch(() => null);
  if (stats === null || (!stats.isFile() && !stats.isDirectory())) return null;
  return {
    name: options.entry.name,
    type: stats.isDirectory() ? "directory" : "file",
    size: stats.size,
    modifiedAt: stats.mtime,
    descend: stats.isDirectory() && !linkStats.isSymbolicLink(),
  };
}

/**
 * Resolves a URL path beneath a directory root and rejects traversal, hidden
 * paths, and symbolic links whose real target escapes that root.
 */
export async function resolveSafePath(options: {
  readonly rootDirectory: string;
  readonly requestedPath: string;
  readonly showHidden: boolean;
}): Promise<PathResolution> {
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(options.requestedPath);
  } catch {
    return { status: "forbidden", reason: "The path is not valid URL encoding." };
  }

  const strippedPath = decodedPath.replace(/^[\\/]+/u, "").replace(/[\\/]+$/u, "");
  const relativePath = strippedPath === "." ? "" : strippedPath;
  if (!options.showHidden && containsHiddenSegment(relativePath)) {
    return { status: "forbidden", reason: "Hidden paths are not available." };
  }

  const rootPath = await fs.realpath(options.rootDirectory).catch(() => null);
  if (rootPath === null) {
    return { status: "not_found", reason: "The configured root directory does not exist." };
  }

  const candidatePath = path.resolve(rootPath, relativePath || ".");
  if (!isWithinRoot(rootPath, candidatePath)) {
    return { status: "forbidden", reason: "The requested path is outside the shared directory." };
  }

  const realCandidate = await fs.realpath(candidatePath).catch(() => null);
  if (realCandidate === null) return { status: "not_found", reason: "The requested path does not exist." };
  if (!isWithinRoot(rootPath, realCandidate)) {
    return { status: "forbidden", reason: "Symbolic links outside the shared directory are blocked." };
  }

  const publishedRelative = path.relative(rootPath, realCandidate).split(path.sep).join("/");
  if (!options.showHidden && containsHiddenSegment(publishedRelative)) {
    return { status: "forbidden", reason: "Hidden paths are not available." };
  }

  return {
    status: "resolved",
    absolutePath: realCandidate,
    relativePath: publishedRelative,
  };
}
