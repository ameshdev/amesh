# @authmesh/keystore

Hardware-backed key storage for [amesh](https://github.com/ameshdev/amesh). Stores P-256 private keys in Secure Enclave, macOS Keychain, or TPM 2.0.

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

The platform is auto-detected. macOS tries Secure Enclave first, falls back to Keychain. Linux uses TPM 2.0. Hardware-backed key storage is required --- amesh does not support software-only key storage.

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
