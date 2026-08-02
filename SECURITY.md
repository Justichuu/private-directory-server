# Security policy

## Supported versions

Security fixes are applied to the latest release.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting feature instead of opening a public issue. Include the affected version, impact, and minimal reproduction details. Do not include real access tokens or private file contents.

## Deployment boundary

The default localhost binding does not make the server reachable from another device. A non-loopback `HOST` requires `ACCESS_TOKEN`. Use a strong, unique token, an operating-system firewall, and a trusted network. This project does not terminate TLS; use a trusted private reverse proxy when transport encryption is required.
