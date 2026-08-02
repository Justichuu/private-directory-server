# Configuration

Configuration is read once at startup from environment variables. Invalid security-sensitive values stop the server instead of silently falling back.

## Variables

### `DIRECTORY_ROOT`

- Default: current working directory
- Absolute or relative directory to share.
- Startup fails when the resolved path is missing or is not a directory.

### `HOST`

- Default: `127.0.0.1`
- Listening interface.
- `127.0.0.1`, `::1`, and `localhost` are treated as loopback.
- Any other value requires `ACCESS_TOKEN`.

### `PORT`

- Default: `8000`
- Valid range: `0` through `65535`.
- `0` asks the operating system to select a free ephemeral port.

### `ACCESS_TOKEN`

- Default: unset
- When present, must contain at least 16 characters.
- Required for non-loopback binding.
- Accepted through the browser login form or `Authorization: Bearer <token>`.
- Never place it in a URL, committed file, screenshot, issue, or request log.

### `ACCESS_MODE`

- Default: `read-only`
- Allowed values: `read-only`, `upload`.
- Upload mode adds new files but cannot overwrite or delete existing files.

### `MAX_UPLOAD_BYTES`

- Default: `104857600` (100 MiB)
- Must be a positive integer.
- Checked against declared and actually received body lengths.

### `SHOW_HIDDEN`

- Default: `false`
- Set exactly to `true` to show dot-prefixed paths.
- Other values behave as `false`.

### `LOG_REQUESTS`

- Default: `false`
- Set exactly to `true` to log client address, method, URL path, response status, and elapsed milliseconds.
- Query strings and access tokens are not logged.

## Recommended profiles

### Local read-only

```powershell
$env:DIRECTORY_ROOT = 'D:\Files'
cmd /c npm start
```

### Trusted LAN read-only

```powershell
$env:DIRECTORY_ROOT = 'D:\Files'
$env:HOST = '0.0.0.0'
$env:ACCESS_TOKEN = '<strong unique token>'
cmd /c npm start
```

### Trusted LAN with uploads

```powershell
$env:DIRECTORY_ROOT = 'D:\Incoming'
$env:HOST = '0.0.0.0'
$env:ACCESS_TOKEN = '<strong unique token>'
$env:ACCESS_MODE = 'upload'
$env:MAX_UPLOAD_BYTES = '52428800'
$env:LOG_REQUESTS = 'true'
cmd /c npm start
```

Use operating-system filesystem permissions and firewall rules as additional boundaries. Application settings cannot grant access that the Node.js process account does not have.
