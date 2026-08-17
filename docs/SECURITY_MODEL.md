# Security model

## Assets protected

- Files and directory names beneath `DIRECTORY_ROOT`
- The configured access token
- The ability to add files when upload mode is enabled
- Host filesystem paths outside the shared root

## Trust boundaries

- The Node.js process account is trusted and defines the maximum filesystem access available to the application.
- Localhost clients are trusted by default because authentication is optional on loopback.
- Network clients are untrusted; non-loopback startup requires authentication.
- Shared file contents are untrusted browser content and are served with content-type and framing restrictions.
- Uploaded bytes are untrusted and are stored without execution or interpretation.

## Controls

### Path confinement

Requested paths are URL-decoded, normalized, resolved against the real root, and checked with `path.relative`. Hidden segments are rejected by default. Existing targets are resolved through `realpath`, preventing symlinks from escaping the root. Upload paths normalize both slash styles before checking the real parent directory.

### Authentication

Tokens are compared through fixed-size SHA-256 digests using constant-time comparison. Browser login creates an opaque digest cookie with `HttpOnly`, `SameSite=Strict`, a root path, and a 24-hour lifetime. Bearer tokens are supported for API clients. Tokens are never accepted in query strings.

### Write control

Uploads are absent in `read-only` mode. Upload mode streams the request body directly to disk and enforces the configured limit as bytes arrive, not just against the declared length; an upload that exceeds it is aborted and its partial file removed. Files are created with exclusive-create semantics; an existing path returns conflict and is never replaced, and a conflict never deletes the file that was already there. There is no delete or rename endpoint.

### Resource bounds

- Login JSON is limited to 8 KiB.
- Upload size is configurable and defaults to 100 MiB.
- Search returns at most 200 matches, descends at most 20 levels, and examines at most 10,000 entries.
- HTTP request, header, and keep-alive timeouts are configured by the server.
- Multiple byte ranges are rejected instead of constructing multipart responses.

## Known limits

- The application serves HTTP and does not terminate TLS.
- It has no user accounts, per-directory ACLs, token rotation protocol, or persistent audit database.
- Localhost mode does not require a token unless one is configured.
- Request logging is operational telemetry, not tamper-resistant auditing.
- Search metadata may change while a large directory is being traversed.
- Filesystem permissions and network firewall rules remain external responsibilities.

Report vulnerabilities privately according to [the repository security policy](../SECURITY.md).
