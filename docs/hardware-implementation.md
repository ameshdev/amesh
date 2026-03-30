# amesh: Hardware Key Storage Implementation Guide

**Status:** Implementation Spec  
**Scope:** `@authmesh/keystore` package — all four drivers  
**Prerequisite:** `amesh-spec-v1.md` (the core protocol spec)

---

## The Core Constraint to Understand First

The Secure Enclave and TPM are not memory you can write a key into. They are **co-processors that generate keys internally and sign data on your behalf.** You never see the private key. You hand them a message, they hand you a signature. This is the security guarantee — and it means the `KeyStore` interface is already shaped correctly:

```typescript
interface KeyStore {
  generateAndStore(deviceId: string): Promise<{ publicKey: Uint8Array }>;
  sign(deviceId: string, message: Uint8Array): Promise<Uint8Array>;
  getPublicKey(deviceId: string): Promise<Uint8Array>;
  delete(deviceId: string): Promise<void>;
}
```

The private key never crosses that interface boundary. That's not a design choice — it's a hardware constraint. Build everything with that mental model.

---

## The Platform Detection Layer

Before any driver code, build the detector. This runs once at `amesh init` and is stored in `identity.json` as `storageBackend`.

```typescript
// packages/keystore/src/detect.ts

export type Backend = 'secure-enclave' | 'tpm2' | 'keytar' | 'encrypted-file';

export async function detectBackend(): Promise<Backend> {
  if (await isSecureEnclaveAvailable()) return 'secure-enclave';
  if (await isTPM2Available())          return 'tpm2';
  if (await isKeytarAvailable())        return 'keytar';
  return 'encrypted-file';
}

async function isSecureEnclaveAvailable(): Promise<boolean> {
  if (process.platform !== 'darwin') return false;
  // security command is available on all macOS
  const { exitCode } = await run('security', ['list-keychains']);
  return exitCode === 0;
}

async function isTPM2Available(): Promise<boolean> {
  if (process.platform !== 'linux') return false;
  // tpm2_getcap is the canonical check
  const { exitCode } = await run('tpm2_getcap', ['properties-fixed']);
  return exitCode === 0;
}

async function isKeytarAvailable(): Promise<boolean> {
  try {
    const keytar = await import('keytar');
    await keytar.findCredentials('amesh-probe');
    return true;
  } catch {
    return false;
  }
}
```

**Important:** Run detection at `init` time and cache the result. Do not re-detect on every operation — the backend is fixed for the lifetime of the identity.

---

## Driver 1: macOS Secure Enclave

### The Reality of Secure Enclave from Node.js

There is no pure Node.js library that talks directly to the Secure Enclave for key generation. Two options:

**Option A: Native Node addon (`node-addon-api`)** — Write C++ that calls Apple's `Security.framework` and `CryptoKit` directly. Full control, no subprocess overhead, but requires compiling native binaries per platform and Node version. The right long-term answer.

**Option B: Swift helper binary** — Ship a small compiled binary (`amesh-se-helper`) that wraps the Secure Enclave APIs, called via subprocess from Node. Faster to build, zero native addon complexity, slightly more deployment surface.

**Recommendation for MVP:** Option B. Ship a small Swift helper binary. The Secure Enclave APIs are significantly easier to write correctly in Swift than in C++, and you can compile it once as a universal binary (arm64 + x86_64). The subprocess overhead (a few milliseconds) is irrelevant since signing happens once per request setup, not in the hot path.

### The Swift Helper Binary

```swift
// amesh-se-helper/main.swift
// Compiled to: packages/keystore/bin/amesh-se-helper-darwin
// Build: swiftc main.swift -o amesh-se-helper-darwin
//        lipo -create amesh-se-helper-arm64 amesh-se-helper-x86_64 -output amesh-se-helper-darwin

import Foundation
import CryptoKit

// Protocol: JSON in via stdin, JSON out via stdout
// Commands: generate, sign, get-public-key, delete

struct Command: Codable {
    let action: String
    let deviceId: String
    let message: String?  // Base64 for sign command
}

struct Response: Codable {
    let success: Bool
    let publicKey: String?   // Base64
    let signature: String?   // Base64
    let error: String?
}

func respond(_ r: Response) {
    let data = try! JSONEncoder().encode(r)
    FileHandle.standardOutput.write(data)
    exit(0)
}

func main() {
    let input = FileHandle.standardInput.readDataToEndOfFile()
    guard let cmd = try? JSONDecoder().decode(Command.self, from: input) else {
        respond(Response(success: false, publicKey: nil, signature: nil, error: "invalid_command"))
        return
    }

    let tag = "dev.amesh.\(cmd.deviceId)".data(using: .utf8)!

    let accessControl = SecAccessControlCreateWithFlags(
        nil,
        kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        [.privateKeyUsage],
        nil
    )!

    let query: [String: Any] = [
        kSecAttrKeyType as String:        kSecAttrKeyTypeECSECPrimeRandom,
        kSecAttrKeySizeInBits as String:  256,
        kSecAttrTokenID as String:        kSecAttrTokenIDSecureEnclave,
        kSecPrivateKeyAttrs as String: [
            kSecAttrIsPermanent as String:    true,
            kSecAttrApplicationTag as String: tag,
            kSecAccessControl as String:      accessControl,
        ]
    ]

    switch cmd.action {

    case "generate":
        var error: Unmanaged<CFError>?
        guard let privateKey = SecKeyCreateRandomKey(query as CFDictionary, &error) else {
            respond(Response(success: false, publicKey: nil, signature: nil,
                             error: error!.takeRetainedValue().localizedDescription))
            return
        }
        let publicKey = SecKeyCopyPublicKey(privateKey)!
        let pubKeyData = SecKeyCopyExternalRepresentation(publicKey, nil)! as Data
        respond(Response(success: true,
                         publicKey: pubKeyData.base64EncodedString(),
                         signature: nil, error: nil))

    case "sign":
        guard let messageB64 = cmd.message,
              let messageData = Data(base64Encoded: messageB64) else {
            respond(Response(success: false, publicKey: nil, signature: nil, error: "missing_message"))
            return
        }
        // Retrieve key from Keychain by tag
        let retrieveQuery: [String: Any] = [
            kSecClass as String:                kSecClassKey,
            kSecAttrApplicationTag as String:   tag,
            kSecAttrKeyType as String:          kSecAttrKeyTypeECSECPrimeRandom,
            kSecReturnRef as String:            true,
        ]
        var keyRef: CFTypeRef?
        guard SecItemCopyMatching(retrieveQuery as CFDictionary, &keyRef) == errSecSuccess,
              let privateKey = keyRef else {
            respond(Response(success: false, publicKey: nil, signature: nil, error: "key_not_found"))
            return
        }
        var signError: Unmanaged<CFError>?
        guard let signature = SecKeyCreateSignature(
            privateKey as! SecKey,
            .ecdsaSignatureMessageX962SHA256,
            messageData as CFData,
            &signError
        ) else {
            respond(Response(success: false, publicKey: nil, signature: nil,
                             error: signError!.takeRetainedValue().localizedDescription))
            return
        }
        respond(Response(success: true, publicKey: nil,
                         signature: (signature as Data).base64EncodedString(), error: nil))

    case "get-public-key":
        let retrieveQuery: [String: Any] = [
            kSecClass as String:                kSecClassKey,
            kSecAttrApplicationTag as String:   tag,
            kSecAttrKeyType as String:          kSecAttrKeyTypeECSECPrimeRandom,
            kSecReturnRef as String:            true,
        ]
        var keyRef: CFTypeRef?
        guard SecItemCopyMatching(retrieveQuery as CFDictionary, &keyRef) == errSecSuccess else {
            respond(Response(success: false, publicKey: nil, signature: nil, error: "key_not_found"))
            return
        }
        let pubKey = SecKeyCopyPublicKey(keyRef as! SecKey)!
        let pubData = SecKeyCopyExternalRepresentation(pubKey, nil)! as Data
        respond(Response(success: true,
                         publicKey: pubData.base64EncodedString(),
                         signature: nil, error: nil))

    case "delete":
        let deleteQuery: [String: Any] = [
            kSecClass as String:                kSecClassKey,
            kSecAttrApplicationTag as String:   tag,
        ]
        SecItemDelete(deleteQuery as CFDictionary)
        respond(Response(success: true, publicKey: nil, signature: nil, error: nil))

    default:
        respond(Response(success: false, publicKey: nil, signature: nil, error: "unknown_action"))
    }
}

main()
```

### The Node.js Driver

```typescript
// packages/keystore/src/drivers/secure-enclave.ts

import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { KeyStore } from '../index';

const execFileAsync = promisify(execFile);
const HELPER_PATH = join(__dirname, '../bin/amesh-se-helper-darwin');

export class SecureEnclaveDriver implements KeyStore {

  private async callHelper(command: object): Promise<any> {
    const input = JSON.stringify(command);
    const { stdout } = await execFileAsync(HELPER_PATH, [], {
      input,
      timeout: 10_000,  // 10s — user may need to confirm biometric prompt
    });
    const result = JSON.parse(stdout);
    if (!result.success) throw new Error(`SE Helper: ${result.error}`);
    return result;
  }

  async generateAndStore(deviceId: string) {
    const result = await this.callHelper({ action: 'generate', deviceId });
    return { publicKey: Buffer.from(result.publicKey, 'base64') };
  }

  async sign(deviceId: string, message: Uint8Array) {
    const result = await this.callHelper({
      action: 'sign',
      deviceId,
      message: Buffer.from(message).toString('base64'),
    });
    return Buffer.from(result.signature, 'base64');
  }

  async getPublicKey(deviceId: string) {
    const result = await this.callHelper({ action: 'get-public-key', deviceId });
    return Buffer.from(result.publicKey, 'base64');
  }

  async delete(deviceId: string) {
    await this.callHelper({ action: 'delete', deviceId });
  }
}
```

---

### Critical: The Key Algorithm Decision

The Secure Enclave natively supports **P-256 (secp256r1)**, not Ed25519. This is a hardware limitation — Apple's chip does not support Ed25519 signing natively. This forces a choice:

| Option | Description | Verdict |
|---|---|---|
| **A** | P-256 for SE, Ed25519 for software backends. Two wire formats. | ❌ Splits your verification logic |
| **B** | P-256 everywhere, all backends. One wire format. | ✅ Recommended |
| **C** | SE wraps an Ed25519 key. Ed25519 decrypted in-memory to sign. | ⚠️ Weaker than native SE signing |

**Recommendation: Switch the wire protocol to P-256 (ECDSA).** It is natively supported by every HSM, every TPM, every Secure Enclave, and every browser. The consistency is worth more than Ed25519 purity, and P-256 is relevant when you eventually build the consumer identity layer.

Update `amesh-spec-v1.md` Section 5 to reflect P-256. Update `@noble/ed25519` to `@noble/curves` which supports both.

---

## Driver 2: Linux TPM 2.0

### The TPM Approach

TPM 2.0 has better Node.js tooling than the Secure Enclave — `tpm2-tools` is a mature CLI suite. For MVP, use `tpm2-tools` via subprocess. Same pattern as the Swift helper, but using existing tools rather than a custom binary.

```typescript
// packages/keystore/src/drivers/tpm.ts

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import type { KeyStore } from '../index';

const execFileAsync = promisify(execFile);

async function tpm2(subcommand: string, args: string[]): Promise<void> {
  const { exitCode, stderr } = await execFileAsync(
    `tpm2_${subcommand}`, args, { timeout: 15_000 }
  );
  if (exitCode !== 0) throw new Error(`tpm2_${subcommand} failed: ${stderr}`);
}

export class TPM2Driver implements KeyStore {

  // Derive a deterministic persistent handle from deviceId
  // Persistent handles are in range 0x81000000 - 0x81FFFFFF
  private handleFor(deviceId: string): string {
    const hash = createHash('sha256').update(deviceId).digest();
    const offset = hash.readUInt32BE(0) & 0x00FFFFFF;
    return `0x81${offset.toString(16).padStart(6, '0')}`;
  }

  // Use randomized temp paths to avoid collisions in concurrent usage
  private tmpPath(suffix: string): string {
    return `/tmp/am_${Date.now()}_${Math.random().toString(36).slice(2)}_${suffix}`;
  }

  private async cleanup(paths: string[]): Promise<void> {
    await Promise.allSettled(paths.map(p => fs.unlink(p)));
  }

  async generateAndStore(deviceId: string) {
    const handle = this.handleFor(deviceId);
    const primaryCtx = this.tmpPath('primary.ctx');
    const keyPub     = this.tmpPath('key.pub');
    const keyPriv    = this.tmpPath('key.priv');
    const keyCtx     = this.tmpPath('key.ctx');
    const keyPem     = this.tmpPath('key.pem');

    try {
      // Step 1: Create primary key in owner hierarchy
      await tpm2('createprimary', ['-C', 'o', '-g', 'sha256', '-G', 'ecc256', '-c', primaryCtx]);

      // Step 2: Create child keypair
      await tpm2('create', ['-C', primaryCtx, '-G', 'ecc256', '-u', keyPub, '-r', keyPriv]);

      // Step 3: Load the key
      await tpm2('load', ['-C', primaryCtx, '-u', keyPub, '-r', keyPriv, '-c', keyCtx]);

      // Step 4: Persist the key (survives reboots)
      await tpm2('evictcontrol', ['-C', 'o', '-c', keyCtx, handle]);

      // Step 5: Export public key as PEM
      await tpm2('readpublic', ['-c', handle, '-f', 'pem', '-o', keyPem]);

      const pem = await fs.readFile(keyPem, 'utf8');
      return { publicKey: this.pemToRaw(pem) };

    } finally {
      await this.cleanup([primaryCtx, keyPub, keyPriv, keyCtx, keyPem]);
    }
  }

  async sign(deviceId: string, message: Uint8Array) {
    const handle  = this.handleFor(deviceId);
    const msgPath = this.tmpPath('msg');
    const sigPath = this.tmpPath('sig');

    try {
      await fs.writeFile(msgPath, message);
      await tpm2('sign', ['-c', handle, '-g', 'sha256', '-o', sigPath, msgPath]);
      return new Uint8Array(await fs.readFile(sigPath));
    } finally {
      await this.cleanup([msgPath, sigPath]);
    }
  }

  async getPublicKey(deviceId: string) {
    const handle = this.handleFor(deviceId);
    const pemPath = this.tmpPath('pub.pem');
    try {
      await tpm2('readpublic', ['-c', handle, '-f', 'pem', '-o', pemPath]);
      const pem = await fs.readFile(pemPath, 'utf8');
      return this.pemToRaw(pem);
    } finally {
      await this.cleanup([pemPath]);
    }
  }

  async delete(deviceId: string) {
    const handle = this.handleFor(deviceId);
    // Remove from persistent storage
    await tpm2('evictcontrol', ['-C', 'o', '-c', handle]);
  }

  private pemToRaw(pem: string): Uint8Array {
    const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
    return Buffer.from(b64, 'base64');
  }
}
```

### The TPM Gotchas You Will Hit

**1. The temp file problem.**
Signing requires writing the message to disk so `tpm2-tools` can read it. Use `/tmp` with randomized filenames, always clean up in a `finally` block. For production, use a `tmpfs` mount so temp files never touch persistent storage:
```bash
# Add to /etc/fstab on production machines:
tmpfs /tmp tmpfs defaults,noatime,mode=1777 0 0
```

**2. TPM resource exhaustion.**
TPMs have a limited number of transient object slots (often 3). If your process crashes mid-operation and leaves handles loaded, subsequent calls fail. Add a startup cleanup routine:
```typescript
// Run on CLI startup, before any TPM operations
async function flushTransientHandles(): Promise<void> {
  await tpm2('flushcontext', ['--transient-object']).catch(() => {});
}
```

**3. CI/CD environments don't have TPMs.**
GitHub Actions, most Docker containers, bare Lambda — no TPM available. The fallback chain handles this, but CI tests must know they're running in `encrypted-file` mode. Set `AMESH_BACKEND_OVERRIDE=encrypted-file` in CI env vars and document this clearly.

**4. TPM permissions.**
On some Linux distros, the TPM device (`/dev/tpm0` or `/dev/tpmrm0`) requires group membership. Add to install docs:
```bash
sudo usermod -aG tss $USER
# Log out and back in, then verify:
tpm2_getcap properties-fixed
```
`amesh init` should detect a permission error specifically and print a clear message rather than a cryptic failure.

---

## Driver 3: OS Keyring (keytar)

The fallback for machines without hardware security modules. Uses the OS-level secret store:
- **macOS:** Keychain (software-only, no Secure Enclave)
- **Linux:** libsecret / GNOME Keyring / KWallet
- **Windows:** Windows Credential Manager (DPAPI)

```typescript
// packages/keystore/src/drivers/keytar.ts

import * as keytar from 'keytar';
import { generateKeyPair } from '@noble/curves/p256';
import type { KeyStore } from '../index';

const SERVICE = 'amesh';

export class KeytarDriver implements KeyStore {

  async generateAndStore(deviceId: string) {
    const privKey = generateKeyPair();  // returns { privateKey, publicKey }
    // Store private key as Base64 in OS keyring
    await keytar.setPassword(SERVICE, `privkey:${deviceId}`,
      Buffer.from(privKey.privateKey).toString('base64'));
    await keytar.setPassword(SERVICE, `pubkey:${deviceId}`,
      Buffer.from(privKey.publicKey).toString('base64'));
    return { publicKey: privKey.publicKey };
  }

  async sign(deviceId: string, message: Uint8Array) {
    const privKeyB64 = await keytar.getPassword(SERVICE, `privkey:${deviceId}`);
    if (!privKeyB64) throw new Error(`No key found for device: ${deviceId}`);
    const privKey = Buffer.from(privKeyB64, 'base64');
    // Sign using @noble/curves
    const { sign } = await import('@noble/curves/p256');
    return sign(message, privKey);
  }

  async getPublicKey(deviceId: string) {
    const pubKeyB64 = await keytar.getPassword(SERVICE, `pubkey:${deviceId}`);
    if (!pubKeyB64) throw new Error(`No key found for device: ${deviceId}`);
    return Buffer.from(pubKeyB64, 'base64');
  }

  async delete(deviceId: string) {
    await keytar.deletePassword(SERVICE, `privkey:${deviceId}`);
    await keytar.deletePassword(SERVICE, `pubkey:${deviceId}`);
  }
}
```

---

## Driver 4: Encrypted File (Last Resort)

Already built. Documented here for completeness. Uses AES-256-GCM with a key derived from a passphrase via Argon2id. This is the CI/CD backend and the baseline for tests.

Key points:
- Passphrase prompted interactively at `init` time
- For CI: accept passphrase via `AMESH_PASSPHRASE` env var (never hardcode)
- File stored at `~/.amesh/key.enc`
- Always warn clearly at startup that this is degraded security

---

## The Unified Driver Index

```typescript
// packages/keystore/src/index.ts

import { detectBackend, type Backend } from './detect';
import { SecureEnclaveDriver }         from './drivers/secure-enclave';
import { TPM2Driver }                  from './drivers/tpm';
import { KeytarDriver }                from './drivers/keytar';
import { EncryptedFileDriver }         from './drivers/encrypted-file';

export interface KeyStore {
  generateAndStore(deviceId: string): Promise<{ publicKey: Uint8Array }>;
  sign(deviceId: string, message: Uint8Array): Promise<Uint8Array>;
  getPublicKey(deviceId: string): Promise<Uint8Array>;
  delete(deviceId: string): Promise<void>;
}

export async function createKeyStore(storedBackend?: Backend): Promise<KeyStore> {
  // Allow CI/CD override
  const override = process.env.AMESH_BACKEND_OVERRIDE as Backend | undefined;
  const backend = override ?? storedBackend ?? await detectBackend();

  if (backend === 'keytar') {
    console.warn(
      '⚠  No hardware security module found. Using OS keyring.\n' +
      '   Keys are software-protected. Secure Enclave or TPM recommended for production.'
    );
  }

  if (backend === 'encrypted-file') {
    console.warn(
      '⚠  Running in degraded security mode. Key is protected only by your passphrase.\n' +
      '   Not recommended for production. Set up TPM or use a machine with Secure Enclave.'
    );
  }

  switch (backend) {
    case 'secure-enclave': return new SecureEnclaveDriver();
    case 'tpm2':           return new TPM2Driver();
    case 'keytar':         return new KeytarDriver();
    case 'encrypted-file': return new EncryptedFileDriver();
    default: throw new Error(`Unknown backend: ${backend}`);
  }
}
```

---

## The Test Harness — Write This First

Before any driver code, write this. Every driver is validated against the same suite.

```typescript
// packages/keystore/src/drivers/driver.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { KeyStore } from '../index';
import { EncryptedFileDriver } from './encrypted-file';
// Uncomment as you build each driver:
// import { KeytarDriver }         from './keytar';
// import { SecureEnclaveDriver }  from './secure-enclave';  // macOS only
// import { TPM2Driver }           from './tpm';              // Linux only

function testDriver(name: string, factory: () => Promise<KeyStore>) {
  describe(name, () => {
    let store: KeyStore;
    const deviceId = `test-device-${Date.now()}`;

    beforeEach(async () => { store = await factory(); });
    afterEach(async ()  => { await store.delete(deviceId).catch(() => {}); });

    it('generates a keypair and returns a public key', async () => {
      const { publicKey } = await store.generateAndStore(deviceId);
      expect(publicKey).toBeInstanceOf(Uint8Array);
      expect(publicKey.length).toBeGreaterThan(0);
    });

    it('getPublicKey matches the key returned at generation', async () => {
      const { publicKey } = await store.generateAndStore(deviceId);
      const retrieved = await store.getPublicKey(deviceId);
      expect(Buffer.from(publicKey).toString('hex'))
        .toBe(Buffer.from(retrieved).toString('hex'));
    });

    it('signs a message and the signature verifies', async () => {
      const { publicKey } = await store.generateAndStore(deviceId);
      const message = Buffer.from('amesh test message');
      const signature = await store.sign(deviceId, message);

      // Verify using @noble/curves directly (not via KeyStore — we want to
      // test that the output signature is externally valid)
      const { verify } = await import('@noble/curves/p256');
      expect(verify(signature, message, publicKey)).toBe(true);
    });

    it('two different messages produce different signatures', async () => {
      await store.generateAndStore(deviceId);
      const sig1 = await store.sign(deviceId, Buffer.from('message one'));
      const sig2 = await store.sign(deviceId, Buffer.from('message two'));
      expect(Buffer.from(sig1).toString('hex'))
        .not.toBe(Buffer.from(sig2).toString('hex'));
    });

    it('same message produces a valid (possibly different) signature each time', async () => {
      const { publicKey } = await store.generateAndStore(deviceId);
      const message = Buffer.from('same message');
      const sig1 = await store.sign(deviceId, message);
      const sig2 = await store.sign(deviceId, message);
      // ECDSA is non-deterministic — signatures differ but both verify
      const { verify } = await import('@noble/curves/p256');
      expect(verify(sig1, message, publicKey)).toBe(true);
      expect(verify(sig2, message, publicKey)).toBe(true);
    });

    it('sign throws after delete', async () => {
      await store.generateAndStore(deviceId);
      await store.delete(deviceId);
      await expect(store.sign(deviceId, Buffer.from('test')))
        .rejects.toThrow();
    });

    it('changing one byte of message invalidates signature', async () => {
      const { publicKey } = await store.generateAndStore(deviceId);
      const message = Buffer.from('original message');
      const signature = await store.sign(deviceId, message);
      const tampered = Buffer.from(message);
      tampered[0] ^= 0x01; // flip one bit
      const { verify } = await import('@noble/curves/p256');
      expect(verify(signature, tampered, publicKey)).toBe(false);
    });
  });
}

// Register drivers
testDriver('EncryptedFileDriver', async () => new EncryptedFileDriver({ passphrase: 'test-passphrase' }));
// testDriver('KeytarDriver',         async () => new KeytarDriver());
// testDriver('SecureEnclaveDriver',  async () => new SecureEnclaveDriver());  // macOS CI only
// testDriver('TPM2Driver',           async () => new TPM2Driver());           // Linux TPM CI only
```

When you add a new driver: uncomment one line. If it passes, the driver is correct.

---

## Build Order

Do not build all four drivers in parallel.

| Week | Task | Exit Criteria |
|---|---|---|
| **1** | `EncryptedFileDriver` with full test suite passing | Baseline reference implementation. All 7 test cases green. |
| **2** | macOS Secure Enclave via Swift helper | `SecureEnclaveDriver` passes all 7 test cases on Apple Silicon. Universal binary builds on CI. |
| **3** | Linux TPM 2.0 via `tpm2-tools` | `TPM2Driver` passes all 7 test cases on a real machine with TPM 2.0. Temp file cleanup verified. |
| **4** | Platform detection + `KeytarDriver` + integration | `amesh init` auto-selects correct driver. Degraded mode warnings print correctly. CI uses `AMESH_BACKEND_OVERRIDE`. |

---

## Security Notes

**The algorithm decision is permanent.** Once you ship P-256 on the wire, changing it is a breaking change requiring a migration path. Make this decision consciously before writing the verification middleware.

**The Swift binary is part of your trust chain.** Ship it as a pre-compiled universal binary in the npm package. Do not compile it on the user's machine. Verify its checksum in the Node.js driver before executing it — a compromised binary that returns a fake public key would break the entire security model.

```typescript
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const EXPECTED_SHA256 = 'HARDCODED_HASH_FROM_BUILD_PIPELINE';

function verifyHelperIntegrity(): void {
  const binary = readFileSync(HELPER_PATH);
  const actual = createHash('sha256').update(binary).digest('hex');
  if (actual !== EXPECTED_SHA256) {
    throw new Error('CRITICAL: amesh-se-helper binary integrity check failed. Do not proceed.');
  }
}
```

**TPM temp files contain message data.** Always use `finally` blocks. Consider a `tmpfs` mount on production Linux machines so temp files never touch spinning disk or SSD wear cells.

---

*End of amesh-hardware-key-storage.md*  
*Next document: `amesh-redis-nonce-adapter.md` (multi-instance nonce deduplication)*