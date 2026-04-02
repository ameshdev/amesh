# @authmesh/keystore

Device-bound key storage for [amesh](https://github.com/ameshdev/amesh). Stores P-256 private keys in the best available backend on your platform.

## Install

```bash
npm install @authmesh/keystore
```

## Storage backends

| Backend | Platform | Security |
|---------|----------|----------|
| `secure-enclave` | macOS (signed binary) | Key never leaves the chip |
| `keychain` | macOS | OS-level software keychain |
| `tpm2` | Linux | TPM 2.0 hardware module |
| `encrypted-file` | Any (explicit opt-in) | AES-256-GCM + Argon2id, filesystem permissions |

Hardware backends are auto-detected. macOS tries Secure Enclave first, falls back to Keychain. Linux uses TPM 2.0. The encrypted-file backend is available on any platform as an explicit opt-in for cloud VMs and containers without hardware key storage.

## Usage

```typescript
import { detectAndCreate, AllowList } from '@authmesh/keystore';

// Auto-detect best available backend
const { keyStore, backend } = await detectAndCreate('/path/to/keys');

// Sign a message (private key never returned)
const signature = await keyStore.sign(deviceId, message);

// Get public key
const publicKey = await keyStore.getPublicKey(deviceId);
```

Most users should use [`@authmesh/sdk`](https://github.com/ameshdev/amesh/tree/main/packages/sdk) instead --- it handles key loading automatically.

## License

[MIT](https://github.com/ameshdev/amesh/blob/main/LICENSE)
