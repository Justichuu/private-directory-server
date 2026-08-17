# Architecture

## Overview

Private Directory Server is one Node.js process with no runtime packages. It serves a static browser application and a small HTTP API from the same origin.

```text
Browser or API client
        |
        v
Node HTTP request handler
  |     |       |       |
  |     |       |       +-- session authentication
  |     |       +---------- directory search and listing
  |     +------------------ preview/download range streaming
  +------------------------ optional bounded upload
        |
        v
Configured DIRECTORY_ROOT
```

## Components

| Component | Responsibility |
| --- | --- |
| `src/server.ts` | Validates startup state, creates the HTTP server, applies timeouts, and handles shutdown |
| `src/app.ts` | Routes requests, enforces authentication and permissions, and composes services |
| `src/config.ts` | Parses and validates environment configuration |
| `src/auth-service.ts` | Constant-time token verification and opaque session cookies |
| `src/path-service.ts` | URL decoding, hidden-path policy, real-path confinement, and symlink escape prevention |
| `src/directory-service.ts` | Non-recursive directory listing and metadata, with bounded-concurrency `stat` calls |
| `src/search-service.ts` | Bounded breadth-first recursive name search without following symlinks |
| `src/range-service.ts` | Single byte-range parsing and validation |
| `src/request-body.ts` | Bounded raw and JSON request-body reads, and streamed-to-disk uploads |
| `src/cache-service.ts` | ETag/Last-Modified validators and conditional-request (304) evaluation |
| `src/compression.ts` | Accept-Encoding negotiation and streaming brotli/gzip compressors |
| `src/http-utils.ts` | JSON, error, cache, and browser security headers, with automatic response compression |
| `src/client.ts` | Explicit browser state machine, navigation, authentication, search, preview, and upload UI |
| `scripts/package-release.ts` | Creates a dependency-free runtime directory |

## Request lifecycle

1. Parse the URL and attach optional completion logging.
2. Allow only the minimal public surface: static browser assets, health, and session operations.
3. Authenticate protected API and file requests through a bearer token or opaque session cookie.
4. Resolve requested filesystem paths through the real-path confinement service.
5. Apply the configured read-only or upload permission.
6. Return structured JSON, a bounded upload result, or a streamed file response.
7. Add security headers to every response created by the application.

## Data ownership

The server has no database. Session cookies are deterministic token digests held by the browser and are not stored server-side. Search indexes are not persisted. Uploads, when enabled, stream directly to a new file under `DIRECTORY_ROOT`, never buffering the whole body in memory; the transfer is aborted and the partial file removed if it exceeds the configured limit, and existing files are never replaced.

## Performance

- Static assets and shared files send `ETag`/`Last-Modified` validators; a matching conditional `GET`/`HEAD` (`If-None-Match` or `If-Modified-Since`) gets a bodyless `304`, except when the request also carries a `Range` header.
- JSON API responses and text-based file and asset bodies are compressed with brotli or gzip when the client's `Accept-Encoding` allows it and the payload is large enough to benefit; `Range` responses and already-compressed formats (images, audio, video, PDF) are never compressed.
- Directory listing and recursive search bound their concurrent filesystem calls instead of firing one `stat` per entry unconditionally.
- The browser UI batches large directory listings into a single DOM update and paints them incrementally across animation frames, using one delegated click handler instead of one per row.

## Generated files

`public/app.js` is generated from `src/client.ts`. `dist/` and `release/` are generated and ignored. `docs/screenshot.png` is a checked-in real render used by the GitHub README.
