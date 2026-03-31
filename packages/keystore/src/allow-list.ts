import { computeHmac, verifyHmac, deriveKey } from '@authmesh/core';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface AllowListDevice {
  deviceId: string;
  publicKey: string; // base64 compressed P-256
  friendlyName: string;
  addedAt: string; // ISO 8601
  addedBy: 'handshake' | 'manual';
  role: 'controller' | 'target';
}

export interface AllowListData {
  version: '2.0.0';
  devices: AllowListDevice[];
  updatedAt: string; // ISO 8601
  hmac: string; // base64 HMAC-SHA256
}

const HMAC_SALT = 'amesh-allow-list-integrity-v1';

/**
 * Derive the HMAC key for allow list integrity from the device's private key material.
 * Uses HKDF with device-specific info for domain separation.
 */
function deriveHmacKey(privateKeyMaterial: Uint8Array, deviceId: string): Uint8Array {
  return deriveKey(privateKeyMaterial, HMAC_SALT, deviceId, 32);
}

/**
 * Compute the canonical JSON representation for HMAC computation.
 * Only includes {version, devices, updatedAt} — the hmac field itself is excluded.
 */
function canonicalPayload(data: Omit<AllowListData, 'hmac'>): Uint8Array {
  const canonical = JSON.stringify({
    version: data.version,
    devices: data.devices,
    updatedAt: data.updatedAt,
  });
  return new TextEncoder().encode(canonical);
}

/**
 * HMAC-sealed allow list reader/writer.
 *
 * Every read verifies the HMAC seal. Every write regenerates it.
 * Writes are atomic (tmp file + rename) to prevent partial writes.
 */
export class AllowList {
  private readonly filePath: string;
  private readonly hmacKey: Uint8Array;

  constructor(filePath: string, privateKeyMaterial: Uint8Array, deviceId: string) {
    this.filePath = filePath;
    this.hmacKey = deriveHmacKey(privateKeyMaterial, deviceId);
  }

  /**
   * Read and verify the allow list. Throws if HMAC check fails.
   */
  async read(): Promise<AllowListData> {
    let content: string;
    try {
      content = await readFile(this.filePath, 'utf-8');
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return this.createEmpty();
      }
      throw err;
    }

    const data = JSON.parse(content) as AllowListData;
    this.verifyIntegrity(data);

    // Migrate legacy entries without role field (default to 'controller' — permissive)
    let needsReseal = false;
    for (const device of data.devices) {
      if (!device.role) {
        (device as AllowListDevice).role = 'controller';
        needsReseal = true;
      }
    }
    if (needsReseal) {
      data.updatedAt = new Date().toISOString();
      await this.writeSealed(data);
    }

    return data;
  }

  /**
   * Add a device to the allow list.
   */
  async addDevice(device: AllowListDevice): Promise<AllowListData> {
    const data = await this.read();

    // Prevent duplicates
    if (data.devices.some((d) => d.deviceId === device.deviceId)) {
      throw new Error(`Device ${device.deviceId} already in allow list`);
    }

    data.devices.push(device);
    data.updatedAt = new Date().toISOString();

    await this.writeSealed(data);
    return data;
  }

  /**
   * Remove a device from the allow list.
   */
  async removeDevice(deviceId: string): Promise<AllowListData> {
    const data = await this.read();
    const before = data.devices.length;
    data.devices = data.devices.filter((d) => d.deviceId !== deviceId);

    if (data.devices.length === before) {
      throw new Error(`Device ${deviceId} not found in allow list`);
    }

    data.updatedAt = new Date().toISOString();
    await this.writeSealed(data);
    return data;
  }

  /**
   * Find a device by its public key (base64). Used during verification.
   */
  async findByPublicKey(publicKeyBase64: string): Promise<AllowListDevice | undefined> {
    const data = await this.read();
    return data.devices.find((d) => d.publicKey === publicKeyBase64);
  }

  /**
   * Count devices by role.
   */
  async countByRole(role: 'controller' | 'target'): Promise<number> {
    const data = await this.read();
    return data.devices.filter((d) => d.role === role).length;
  }

  /**
   * Replace all devices with the given role with a single new device.
   * Used to enforce single-controller limit on targets.
   */
  async replaceByRole(role: 'controller' | 'target', device: AllowListDevice): Promise<AllowListData> {
    const data = await this.read();
    data.devices = data.devices.filter((d) => d.role !== role);
    data.devices.push(device);
    data.updatedAt = new Date().toISOString();
    await this.writeSealed(data);
    return data;
  }

  /**
   * Verify HMAC integrity. Throws on failure — never silently continue.
   */
  private verifyIntegrity(data: AllowListData): void {
    const payload = canonicalPayload(data);
    const expectedHmac = Buffer.from(data.hmac, 'base64');

    if (!verifyHmac(this.hmacKey, payload, expectedHmac)) {
      throw new Error(
        'CRITICAL: allow_list integrity check failed — possible tampering. ' +
          'The HMAC seal does not match. Refusing to process.',
      );
    }
  }

  /**
   * Write the allow list with a fresh HMAC seal. Atomic write.
   */
  private async writeSealed(data: AllowListData): Promise<void> {
    const payload = canonicalPayload(data);
    const hmac = computeHmac(this.hmacKey, payload);
    data.hmac = Buffer.from(hmac).toString('base64');

    const tmpPath = `${this.filePath}.tmp`;
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
    await writeFile(tmpPath, JSON.stringify(data, null, 2), { encoding: 'utf-8', mode: 0o600 });
    await rename(tmpPath, this.filePath);
  }

  private async createEmpty(): Promise<AllowListData> {
    const data: AllowListData = {
      version: '2.0.0',
      devices: [],
      updatedAt: new Date().toISOString(),
      hmac: '',
    };
    await this.writeSealed(data);
    return this.read(); // Re-read to verify round-trip
  }
}
