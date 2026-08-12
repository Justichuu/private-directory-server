# Development and releases

## Toolchain

- Node.js 22 or newer
- npm lockfile installation
- Strict TypeScript for server, browser, tests, and packaging scripts

## Local workflow

```powershell
cmd /c npm run check
cmd /c npm test
cmd /c npm start
```

A separate `npm ci` is no longer required first: `scripts/ensure-deps.js` runs ahead of `check`, `test`, `start`, `package`, and `menu`, and installs dependencies the first time any of them is invoked in a fresh checkout.

`npm run check` type-checks server and browser inputs without emitting files. `npm test` rebuilds and runs Node's test runner against the real HTTP handler on ephemeral localhost ports. `npm run menu` presents an interactive, numbered menu over all of the above plus starting the server, for anyone who would rather not remember the individual commands.

## Desktop launcher (Windows)

`gui/Launcher.cs` is a small, dependency-free system-tray app: right-click for Start/Stop, Open in Browser, choose the shared folder, view the log, or exit. It always binds to `127.0.0.1` and never touches `ACCESS_TOKEN` — it's for local single-PC use, not network exposure.

It's plain C# against `System.Windows.Forms`/`System.Drawing`, compiled with the `csc.exe` that ships with every Windows install (part of .NET Framework), so it adds no npm dependency and no build tooling requirement beyond Windows itself. Build it with:

```powershell
gui\build.cmd
```

This produces `Private Directory Server.exe` at the repo root (gitignored — build it locally or download it from a release; it is not committed, so anyone can verify the binary matches `gui/Launcher.cs` by rebuilding it). It spawns `node dist/src/server.js` directly with `CreateNoWindow=true`, so no console ever appears; on first run it shells out to `cmd.exe /c npm ci` and `npm run build` if `dist/src/server.js` is missing yet (`npm.cmd` is a batch file and cannot be launched directly with `UseShellExecute=false`, hence the `cmd.exe /c` wrapper).

## Test coverage by behavior

- Startup configuration and token requirements
- Browser and health routes
- Directory ordering and hidden-file filtering
- Full downloads and security headers
- Valid, suffix, and unsatisfiable byte ranges
- Recursive search
- Bearer authentication and browser session cookies
- Bounded, non-overwriting upload permissions
- Slash-style traversal and hidden-path rejection
- Unsupported request methods

## Browser build

`src/client.ts` is the authoritative browser source. `tsconfig.client.json` emits `public/app.js`. Commit both files together so release downloads do not require TypeScript.

## Runtime package

```powershell
cmd /c npm run package
```

The command builds the application and creates `release/private-directory-server` with compiled server files, browser assets, launchers, license, and documentation. The generated runtime has no npm dependencies.

## Continuous integration

`.github/workflows/ci.yml` runs lockfile installation, strict checks, tests, and packaging on current GitHub-hosted Windows and Ubuntu runners. The Ubuntu job builds the Docker image, starts a container, checks its live health endpoint, and uploads the unpacked runtime as a workflow artifact.

`.github/workflows/codeql.yml` runs GitHub CodeQL's extended JavaScript/TypeScript security query suite for pushes, pull requests, and a weekly schedule.

## Releases

1. Ensure the version in `package.json`, `package-lock.json`, and `CHANGELOG.md` agrees.
2. Run the complete local verification gate.
3. Merge the release commit into `main` and verify CI.
4. Create and push a matching tag such as `v1.1.0`.
5. `.github/workflows/release.yml` reruns checks, creates `.zip` and `.tar.gz` archives, and publishes a GitHub release with generated notes.
6. Download an archive and verify startup on a clean machine when possible.

Before release, verify Docker on a host with Docker installed. Confirm image construction, container health, authentication enforcement, mounted-file visibility, read-only behavior, and a non-root runtime user. A successful TypeScript build alone does not prove container startup.
