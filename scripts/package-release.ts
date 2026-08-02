import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

interface SourceManifest {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly license: string;
  readonly repository: unknown;
  readonly engines: unknown;
}

function isSourceManifest(value: unknown): value is SourceManifest {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<Record<keyof SourceManifest, unknown>>;
  return typeof candidate.name === "string"
    && typeof candidate.version === "string"
    && typeof candidate.description === "string"
    && typeof candidate.license === "string"
    && typeof candidate.repository === "object"
    && candidate.repository !== null
    && typeof candidate.engines === "object"
    && candidate.engines !== null;
}

const workspace = process.cwd();
const releaseRoot = path.join(workspace, "release");
const packageRoot = path.join(releaseRoot, "private-directory-server");

async function createRuntimeManifest(): Promise<Record<string, unknown>> {
  const parsed: unknown = JSON.parse(await readFile(path.join(workspace, "package.json"), "utf8"));
  if (!isSourceManifest(parsed)) throw new Error("package.json does not contain the required release metadata.");
  return {
    name: parsed.name,
    version: parsed.version,
    description: parsed.description,
    license: parsed.license,
    repository: parsed.repository,
    engines: parsed.engines,
    scripts: { start: "node dist/src/server.js" },
  };
}

/** Creates a dependency-free, ready-to-run release directory. */
async function packageRelease(): Promise<void> {
  await rm(releaseRoot, { recursive: true, force: true });
  await mkdir(packageRoot, { recursive: true });
  await Promise.all([
    cp(path.join(workspace, "dist", "src"), path.join(packageRoot, "dist", "src"), { recursive: true }),
    cp(path.join(workspace, "public"), path.join(packageRoot, "public"), { recursive: true }),
    cp(path.join(workspace, "README.md"), path.join(packageRoot, "README.md")),
    cp(path.join(workspace, "LICENSE"), path.join(packageRoot, "LICENSE")),
    cp(path.join(workspace, "CHANGELOG.md"), path.join(packageRoot, "CHANGELOG.md")),
    cp(path.join(workspace, "SECURITY.md"), path.join(packageRoot, "SECURITY.md")),
    cp(path.join(workspace, "docs"), path.join(packageRoot, "docs"), { recursive: true }),
  ]);
  await writeFile(path.join(packageRoot, "package.json"), `${JSON.stringify(await createRuntimeManifest(), null, 2)}\n`, "utf8");
  await writeFile(path.join(packageRoot, "start.cmd"), "@echo off\r\nnode dist\\src\\server.js\r\n", "utf8");
  await writeFile(path.join(packageRoot, "start.sh"), "#!/usr/bin/env sh\nexec node dist/src/server.js\n", { encoding: "utf8", mode: 0o755 });
  console.log(`Release directory created: ${packageRoot}`);
}

void packageRelease().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Release packaging failed.");
  process.exitCode = 1;
});
