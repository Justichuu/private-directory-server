# Changelog

This project follows semantic versioning. Dates use the ISO `YYYY-MM-DD` format.

## Unreleased

### Added

- Automatic dependency installation on first use of `npm start`, `test`, `check`, `package`, or the new `menu` script — a fresh checkout no longer needs a separate `npm ci` step.
- `npm run menu`, an interactive numbered menu covering start/test/check/build/package.
- Double-click wrappers (`start`/`test`/`menu` `.cmd` and `.sh`) for anyone who would rather not use a terminal.
- A Windows system-tray desktop launcher (`gui/Launcher.cs`, built with the C# compiler bundled in .NET Framework — no new npm dependency): Start/Stop, Open in Browser, choose the shared folder, view the log, and exit, with no console window ever shown. Build it locally with `gui\build.cmd`, or download it from a GitHub release.

## 1.1.0 - 2026-08-02

### Added

- Optional access-token authentication with HTTP-only browser sessions and bearer-token support.
- Recursive filename search capped by depth, result count, and scanned-entry count.
- Inline image, text, PDF, audio, and video previews.
- Standards-compatible single-range responses for media seeking and resumed downloads.
- Optional bounded uploads that never overwrite an existing file.
- Configurable access logging and upload limits.
- Dependency-free release directory generation with Windows and POSIX launchers.
- Docker image definition with CI startup verification, Windows/Linux CI, CodeQL analysis, tagged release automation, Dependabot configuration, and consistent repository line endings.
- Security policy, contribution guide, issue template, screenshot, architecture documentation, and collaborative-development documentation.

### Security

- Non-loopback binding now requires an access token of at least 16 characters.
- Browser tokens are exchanged for opaque `HttpOnly`, `SameSite=Strict` cookies.
- Upload paths normalize both slash styles before confinement checks.
- Request bodies are explicitly bounded.
- Search does not follow symbolic links.

### Verification

- Strict server and browser TypeScript checks passed.
- All nine configuration and HTTP integration tests passed.
- Source and dependency-free release launchers returned ready health and HTTP 200 responses.
- The production Docker image built and ran successfully with a healthy container, required authentication, enforced read-only mode, exposed mounted files, and ran as a non-root user.
- Dependency audit reported no known vulnerabilities.

## 1.0.0 - 2026-08-02

- Initial standalone, localhost-only, read-only directory browser.
- Hidden-path, traversal, and symbolic-link escape protection.
- Strict TypeScript server and browser code with HTTP integration tests.
