# Changelog

This project follows semantic versioning. Dates use the ISO `YYYY-MM-DD` format.

## Unreleased

### Added

- Automatic dependency installation on first use of `npm start`, `test`, `check`, `package`, or the new `menu` script — a fresh checkout no longer needs a separate `npm ci` step.
- `npm run menu`, an interactive numbered menu covering start/test/check/build/package.
- Double-click wrappers (`start`/`test`/`menu` `.cmd` and `.sh`) for anyone who would rather not use a terminal.
- A Windows system-tray desktop launcher (`gui/Launcher.cs`, built with the C# compiler bundled in .NET Framework — no new npm dependency): Start/Stop, Open in Browser, choose the shared folder, view the log, and exit, with no console window ever shown. Build it locally with `gui\build.cmd`, or download it from a GitHub release.
- "Show Phone Address / QR Code..." in the tray app: turns on network access (with a confirmation prompt and an auto-generated access token, per the existing non-loopback token requirement) and shows a scannable QR code plus copyable address/token for opening the server on a phone on the same Wi-Fi network.
- Conditional `GET`/`HEAD` support: static assets and shared files now send `ETag`/`Last-Modified` and answer a matching `If-None-Match`/`If-Modified-Since` with a bodyless `304`, except on `Range` requests.
- Automatic brotli/gzip compression, negotiated via `Accept-Encoding`, for JSON API responses and text-based file/asset bodies above a small size threshold, with `Vary: Accept-Encoding` set whenever it applies. Compressed and cacheable responses never overlap with `Range` responses.
- A preload hint for the client script in `index.html` so it downloads in parallel with the stylesheet, plus `theme-color` and `viewport-fit=cover` for mobile browser chrome.

### Changed

- Uploads now stream directly to disk instead of buffering the whole file in memory first; an upload that exceeds the configured limit is aborted mid-transfer and its partial file is removed (a file that already existed at that path is never touched or deleted).
- Directory listing bounds its concurrent `stat` calls (previously unbounded) and reuses one `Intl.Collator` for sorting instead of constructing one per comparison.
- Recursive search only `stat`s entries whose name actually matches the query, and its traversal queue no longer pays an O(n) cost per dequeue.
- The browser UI batches directory listings into a single `DocumentFragment` update with one delegated click handler (previously up to three listeners per row), and paints very large listings incrementally across animation frames instead of blocking on the full list.
- List rows use `content-visibility: auto` so off-screen rows in huge directories cost nothing to lay out; touch targets are guaranteed at least 44px under a coarse pointer, and `prefers-reduced-motion` is honored.

### Fixed

- A file descriptor leak on aborted downloads: an interrupted stream (a cancelled download, a phone seeking through a video) is now always destroyed instead of left open.
- `GET /api/files` on a path that stops existing between resolution and the filesystem check now returns `404` instead of a `500`.
- A client-side race where a slow directory or search response could overwrite the view for a newer, faster one; requests now cancel their predecessor and stale responses are ignored.
- Re-selecting the same file in the upload picker after a failed upload now works; the input is cleared on every outcome, not only on success.

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
