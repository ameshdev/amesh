# Contributing to amesh

Thanks for your interest in contributing to amesh! This guide will help you get started.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) 1.3+
- Git

### Setup

```bash
git clone https://github.com/ameshdev/amesh.git
cd amesh
bun install
bun run build
bun run test
```

### Project Structure

```
packages/
  core/       — crypto primitives (sign, verify, HMAC, HKDF, ECDH)
  keystore/   — key storage drivers (Secure Enclave, TPM, encrypted file)
  cli/        — amesh CLI (oclif)
  cli/        — unified amesh CLI + agent daemon
  sdk/        — signing fetch client + verification middleware
  relay/      — WebSocket relay for device pairing
```

## Development Workflow

1. **Fork** the repository and create a branch from `main`
2. **Make your changes** — keep commits focused and atomic
3. **Run checks** before pushing:

```bash
bun run build    # TypeScript compilation
bun run test     # All tests
bun run lint     # ESLint + Prettier
```

4. **Open a pull request** against `main`

## Pull Request Guidelines

- Keep PRs focused — one concern per PR
- Include tests for new functionality
- Update documentation if you change user-facing behavior
- All CI checks must pass

## What to Contribute

- **Bug fixes** — always welcome
- **Tests** — especially adversarial/edge case tests
- **Documentation** — typo fixes, clarifications, new examples
- **New keystore drivers** — Windows DPAPI, Android Keystore, etc.
- **SDK ports** — Python, Go, Rust verification middleware

If you're considering a large change, [open a discussion](https://github.com/ameshdev/amesh/discussions) first so we can align on the approach.

## Code Style

- TypeScript with strict mode
- ESLint + Prettier (config at repo root)
- `bun run lint` must pass with no warnings
- Prefer explicit types at module boundaries, inferred types internally

## Cryptography Changes

Changes to cryptographic code require extra scrutiny:

- Reference the relevant section of `docs/protocol-spec.md`
- Explain **why** the change is correct in the PR description
- Pin exact versions for `@noble/*` dependencies — never use `^`
- Include test vectors where applicable

## Reporting Bugs

Use [GitHub Issues](https://github.com/ameshdev/amesh/issues/new?template=bug_report.yml). Include:

- amesh version (`amesh --version`)
- OS and architecture
- Steps to reproduce
- Expected vs actual behavior

## Security Issues

See [SECURITY.md](SECURITY.md) — do **not** open public issues for vulnerabilities.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
