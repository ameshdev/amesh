# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.5.x   | Yes       |
| < 0.5   | No        |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Instead, use [GitHub Private Vulnerability Reporting](https://github.com/ameshdev/amesh/security/advisories/new) to submit your report. This ensures the issue stays confidential until a fix is available.

### What to include

- Description of the vulnerability
- Steps to reproduce
- Affected package(s) and version(s)
- Impact assessment (what an attacker could achieve)

### What to expect

- **Acknowledgment** within 48 hours
- **Status update** within 7 days
- **Fix timeline** depends on severity — critical issues are patched within 72 hours

### Scope

The following are in scope:

- All `@authmesh/*` npm packages
- The relay server (`relay.authmesh.dev`)
- The CLI and agent binaries
- The protocol specification (`docs/protocol-spec.md`)

### Out of scope

- The documentation website (`authmesh.dev`) — unless it exposes sensitive data
- Social engineering attacks
- Denial of service against the public relay

## Security Design

amesh underwent a full security audit in April 2026. The findings and fixes are documented in [`docs/security-audit-2026-04.md`](docs/security-audit-2026-04.md).

Key security properties:

- Private keys never leave the device (hardware keystore or encrypted file)
- All signatures use P-256 ECDSA with raw r||s encoding
- Replay protection via nonce + timestamp window
- HMAC-sealed allow lists with atomic writes
- Shell sessions use transcript-bound authentication and ChaCha20-Poly1305
