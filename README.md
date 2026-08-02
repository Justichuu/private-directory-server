# Private Directory Server

[![CI](https://github.com/Justichuu/private-directory-server/actions/workflows/ci.yml/badge.svg)](https://github.com/Justichuu/private-directory-server/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A free, open-source, dependency-free runtime for browsing files from your own computer. It provides token authentication, recursive search, mobile-friendly previews, resumable media streaming, and optional non-overwriting uploads while keeping localhost-only, read-only behavior as the default.

This is openly a vibe-coded project: it is being shaped through human direction, testing, and judgment in collaboration with multiple AI development tools. That process does not replace verification. Security-sensitive behavior is documented, tested, and reviewed against the running application before release.

![Private Directory Server browser](docs/screenshot.png)

## Why use it?

- Secure defaults: localhost binding, read-only access, hidden files excluded, and no symlink escape.
- Private-network ready: non-loopback binding requires a strong access token.
- Useful on phones: responsive browsing, search, image/text/PDF/audio/video previews, and downloads.
- Large-file friendly: real single-range HTTP streaming supports media seeking and resumed downloads.
- Deliberately small: Node.js is the only runtime dependency.
- Tested: strict TypeScript plus HTTP integration tests on Windows and Linux.

## Project principles

- Free software: the MIT license permits personal, educational, and commercial use.
- Honest authorship: human and AI-assisted contributions are both welcome when their behavior is understood and verified.
- Secure defaults: convenience features must not silently broaden network or write access.
- Evidence over claims: compilation is not completion; tests, packaging, and real runtime surfaces must pass.
- No telemetry: the server makes no analytics or tracking requests.

## Quick start from source

Requires Node.js 22 or newer.

```powershell
git clone https://github.com/Justichuu/private-directory-server.git
Set-Location private-directory-server
cmd /c npm ci
$env:DIRECTORY_ROOT = 'D:\Path\To\Share'
cmd /c npm start
```

Open `http://127.0.0.1:8000`.

## Run a release download

Download and extract the `.zip` or `.tar.gz` from GitHub Releases, then set `DIRECTORY_ROOT` and run `start.cmd` on Windows or `./start.sh` on Linux/macOS. Release bundles contain compiled JavaScript and need no package installation.

## Private-network access

Create a strong token and bind to the network:

```powershell
$env:ACCESS_TOKEN = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24)).ToLower()
$env:HOST = '0.0.0.0'
$env:DIRECTORY_ROOT = 'D:\Path\To\Share'
cmd /c npm start
```

Enter that token in the browser login screen. The browser stores only an opaque HTTP-only session cookie; it does not save the token in local storage. This server does not provide TLS. Use it on a trusted network or behind a trusted private HTTPS reverse proxy.

## Docker

```powershell
docker build -t private-directory-server .
docker run --rm -p 8000:8000 `
  -e ACCESS_TOKEN='replace-with-a-strong-token' `
  -v 'D:\Path\To\Share:/shared:ro' `
  private-directory-server
```

Open `http://127.0.0.1:8000`. Keep the volume read-only unless optional uploads are intentionally enabled.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `DIRECTORY_ROOT` | Current directory | Directory available through the server |
| `HOST` | `127.0.0.1` | Listening interface; non-loopback values require `ACCESS_TOKEN` |
| `PORT` | `8000` | TCP port; `0` selects a free ephemeral port |
| `ACCESS_TOKEN` | unset | Token of at least 16 characters used for browser and bearer authentication |
| `ACCESS_MODE` | `read-only` | Set to `upload` for bounded, non-overwriting uploads |
| `MAX_UPLOAD_BYTES` | `104857600` | Maximum upload body size in bytes |
| `SHOW_HIDDEN` | `false` | Include dotfiles and dot-directories when `true` |
| `LOG_REQUESTS` | `false` | Log client address, method, path, status, and duration when `true` |

Bearer clients can send `Authorization: Bearer <token>`. Access tokens are never accepted in URLs or written to request logs.

## Security model

- Traversal and malformed URL paths are rejected.
- Real paths are checked so symlinks cannot escape `DIRECTORY_ROOT`.
- Hidden path segments are blocked unless explicitly enabled.
- Uploads are disabled by default, size-limited, and cannot overwrite an existing file.
- Browser sessions use `HttpOnly` and `SameSite=Strict` cookies.
- Security headers restrict framing to same-origin previews, block cross-origin resource use, and prevent unexpected content sniffing.
- The unauthenticated health endpoint exposes only `{ "status": "ready" }`.

See [SECURITY.md](SECURITY.md) before exposing the service beyond localhost.

## Development

```powershell
cmd /c npm run check
cmd /c npm test
cmd /c npm run package
```

`npm run package` creates a dependency-free runtime directory under `release/`. Pull requests run strict checks, integration tests, and packaging on Windows and Linux. Tags matching `v*` produce `.zip` and `.tar.gz` GitHub release assets.

## HTTP API

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Minimal readiness response |
| `GET`, `POST`, `DELETE` | `/api/session` | Session state, login, and logout |
| `GET` | `/api/files?path=<directory>` | Directory listing |
| `POST` | `/api/files?path=<new-file>` | Optional raw-body upload |
| `GET` | `/api/search?path=<directory>&q=<query>` | Recursive name search, capped at 200 results |
| `GET`, `HEAD` | `/view/<file>` | Inline preview with byte-range support |
| `GET`, `HEAD` | `/files/<file>` | Download with byte-range support |

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Please report security issues privately as described in [SECURITY.md](SECURITY.md).

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — components, request flow, and trust boundaries
- [Configuration](docs/CONFIGURATION.md) — every environment variable and deployment example
- [Development and releases](docs/DEVELOPMENT.md) — build, test, packaging, CI, and release process
- [AI-assisted collaboration](docs/AI_COLLABORATION.md) — provenance and review expectations
- [Security model](docs/SECURITY_MODEL.md) — protected assets, controls, and known limits
- [Changelog](CHANGELOG.md) — user-visible release history
- [Acknowledgments](ACKNOWLEDGMENTS.md) — project authorship and collaborative process
