# @authmesh/keystore

Hardware-backed key storage for [amesh](https://github.com/ameshdev/amesh). Stores P-256 private keys in Secure Enclave, TPM 2.0, or encrypted files.

## Install

```bash
npm install @authmesh/keystore
```

## Storage backends

| Backend | Platform | Security |
|---------|----------|----------|
| `secure-enclave` | macOS | Key never leaves the chip |
| `tpm` | Linux | TPM 2.0 hardware module |
| `os-keyring` | macOS/Linux | OS-level keychain/secret-tool |
| `encrypted-file` | Any | AES-256-GCM + Argon2id |

The platform is auto-detected. macOS tries Secure Enclave first, falls back to Keychain. Linux tries TPM, falls back to encrypted file.

## Usage

```typescript
import { createForBackend, AllowList } from '@authmesh/keystore';

// Auto-detect best available backend
const keyStore = await createForBackend('auto', '/path/to/keys', passphrase);

// Sign a message (private key never returned)
const signature = await keyStore.sign(deviceId, message);

// Get public key
const publicKey = await keyStore.getPublicKey(deviceId);
```

Most users should use [`@authmesh/sdk`](https://github.com/ameshdev/amesh/tree/main/packages/sdk) instead --- it handles key loading automatically.

## License

[MIT](https://github.com/ameshdev/amesh/blob/main/LICENSE)
