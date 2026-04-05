import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AllowList } from '../allow-list.js';
import type { AllowListDevice } from '../allow-list.js';

let tempDir: string;
const PRIVATE_KEY_MATERIAL = new Uint8Array(32).fill(0xab);
const DEVICE_ID = 'am_mydevice123';

function filePath() {
  return join(tempDir, 'allow_list.json');
}

function makeDevice(
  id: string,
  name: string,
  role: 'controller' | 'target' = 'controller',
): AllowListDevice {
  return {
    deviceId: id,
    publicKey: Buffer.from(new Uint8Array(33).fill(0x02)).toString('base64'),
    friendlyName: name,
    addedAt: new Date().toISOString(),
    addedBy: 'handshake',
    role,
  };
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'amesh-allow-'));
});

afterEach(async () => {
  await new Promise((r) => setTimeout(r, 50));
  await rm(tempDir, { recursive: true, force: true }).catch(() => {});
});

describe('AllowList', () => {
  describe('read — empty / new', () => {
    it('creates empty allow list if file does not exist', async () => {
      const al = new AllowList(filePath(), PRIVATE_KEY_MATERIAL, DEVICE_ID);
      const data = await al.read();

      expect(data.version).toBe('2.0.0');
      expect(data.devices).toHaveLength(0);
      expect(data.hmac).toBeTruthy();
    });

    it('writes the file on first read', async () => {
      const al = new AllowList(filePath(), PRIVATE_KEY_MATERIAL, DEVICE_ID);
      await al.read();

      const content = await readFile(filePath(), 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.version).toBe('2.0.0');
      expect(parsed.hmac).toBeTruthy();
    });
  });

  describe('addDevice', () => {
    it('adds a device and reseals HMAC', async () => {
      const al = new AllowList(filePath(), PRIVATE_KEY_MATERIAL, DEVICE_ID);
      const device = makeDevice('am_peer1', 'MacBook Pro');

      const data = await al.addDevice(device);
      expect(data.devices).toHaveLength(1);
      expect(data.devices[0].deviceId).toBe('am_peer1');
      expect(data.devices[0].friendlyName).toBe('MacBook Pro');
    });

    it('re-reads successfully after adding (HMAC valid)', async () => {
      const al = new AllowList(filePath(), PRIVATE_KEY_MATERIAL, DEVICE_ID);
      await al.addDevice(makeDevice('am_peer1', 'Dev Laptop'));

      // Fresh instance reads the same file
      const al2 = new AllowList(filePath(), PRIVATE_KEY_MATERIAL, DEVICE_ID);
      const data = await al2.read();
      expect(data.devices).toHaveLength(1);
    });

    it('rejects duplicate device ID', async () => {
      const al = new AllowList(filePath(), PRIVATE_KEY_MATERIAL, DEVICE_ID);
      await al.addDevice(makeDevice('am_dup', 'First'));

      await expect(al.addDevice(makeDevice('am_dup', 'Second'))).rejects.toThrow(
        /already in allow list/,
      );
    });

    it('supports multiple devices', async () => {
      const al = new AllowList(filePath(), PRIVATE_KEY_MATERIAL, DEVICE_ID);
      await al.addDevice(makeDevice('am_a', 'Device A'));
      await al.addDevice(makeDevice('am_b', 'Device B'));
      await al.addDevice(makeDevice('am_c', 'Device C'));

      const data = await al.read();
      expect(data.devices).toHaveLength(3);
    });
  });

  describe('removeDevice', () => {
    it('removes a device and reseals HMAC', async () => {
      const al = new AllowList(filePath(), PRIVATE_KEY_MATERIAL, DEVICE_ID);
      await al.addDevice(makeDevice('am_remove', 'To Remove'));
      await al.addDevice(makeDevice('am_keep', 'To Keep'));

      const data = await al.removeDevice('am_remove');
      expect(data.devices).toHaveLength(1);
      expect(data.devices[0].deviceId).toBe('am_keep');
    });

    it('re-reads successfully after removal (HMAC valid)', async () => {
      const al = new AllowList(filePath(), PRIVATE_KEY_MATERIAL, DEVICE_ID);
      await al.addDevice(makeDevice('am_x', 'X'));
      await al.removeDevice('am_x');

      const al2 = new AllowList(filePath(), PRIVATE_KEY_MATERIAL, DEVICE_ID);
      const data = await al2.read();
      expect(data.devices).toHaveLength(0);
    });

    it('throws if device not found', async () => {
      const al = new AllowList(filePath(), PRIVATE_KEY_MATERIAL, DEVICE_ID);
      await al.read(); // create empty

      await expect(al.removeDevice('am_nonexistent')).rejects.toThrow(/not found/);
    });
  });

  describe('findByPublicKey', () => {
    it('finds device by public key', async () => {
      const al = new AllowList(filePath(), PRIVATE_KEY_MATERIAL, DEVICE_ID);
      const device = makeDevice('am_find', 'Findable');
      await al.addDevice(device);

      const found = await al.findByPublicKey(device.publicKey);
      expect(found).toBeDefined();
      expect(found!.deviceId).toBe('am_find');
    });

    it('returns undefined for unknown public key', async () => {
      const al = new AllowList(filePath(), PRIVATE_KEY_MATERIAL, DEVICE_ID);
      await al.read();

      const found = await al.findByPublicKey('unknown-key');
      expect(found).toBeUndefined();
    });
  });

  describe('role field', () => {
    it('stores and retrieves device role', async () => {
      const al = new AllowList(filePath(), PRIVATE_KEY_MATERIAL, DEVICE_ID);
      await al.addDevice(makeDevice('am_ctrl', 'Controller', 'controller'));
      await al.addDevice(makeDevice('am_tgt', 'Target', 'target'));

      const data = await al.read();
      expect(data.devices[0].role).toBe('controller');
      expect(data.devices[1].role).toBe('target');
    });

    it('countByRole returns correct counts', async () => {
      const al = new AllowList(filePath(), PRIVATE_KEY_MATERIAL, DEVICE_ID);
      await al.addDevice(makeDevice('am_c1', 'Ctrl 1', 'controller'));
      await al.addDevice(makeDevice('am_c2', 'Ctrl 2', 'controller'));
      await al.addDevice(makeDevice('am_t1', 'Target 1', 'target'));

      expect(await al.countByRole('controller')).toBe(2);
      expect(await al.countByRole('target')).toBe(1);
    });

    it('replaceByRole removes old entries and adds new one', async () => {
      const al = new AllowList(filePath(), PRIVATE_KEY_MATERIAL, DEVICE_ID);
      await al.addDevice(makeDevice('am_old', 'Old Controller', 'controller'));
      await al.addDevice(makeDevice('am_tgt', 'Target', 'target'));

      const newCtrl = makeDevice('am_new', 'New Controller', 'controller');
      await al.replaceByRole('controller', newCtrl);

      const data = await al.read();
      const controllers = data.devices.filter((d) => d.role === 'controller');
      expect(controllers).toHaveLength(1);
      expect(controllers[0].deviceId).toBe('am_new');
      // Target should be untouched
      expect(data.devices.find((d) => d.role === 'target')?.deviceId).toBe('am_tgt');
    });

    it('migrates legacy entries without role to controller', async () => {
      const al = new AllowList(filePath(), PRIVATE_KEY_MATERIAL, DEVICE_ID);
      await al.addDevice(makeDevice('am_legacy', 'Legacy'));

      // Manually strip the role field from the file (simulate legacy data)
      const content = JSON.parse(await readFile(filePath(), 'utf-8'));
      delete content.devices[0].role;
      // Reseal manually — need to write without role and fix HMAC
      // Easier: write with the AllowList to get valid HMAC, then strip role and re-verify
      // We'll use a fresh AllowList instance that writes without role by writing raw JSON
      // Actually, we need to write valid HMAC. Let's use a workaround:
      // Just write the stripped JSON and create a new AllowList to re-seal it
      // The migration happens on read(), but read() first verifies HMAC.
      // So legacy files would have been sealed without the role field.
      // We need to simulate that by sealing content without role.

      // Create a brand new file with a device that has no role field,
      // sealed with valid HMAC (simulating pre-role allow list)
      const { computeHmac } = await import('@authmesh/core');
      const { deriveKey } = await import('@authmesh/core');
      const hmacKey = deriveKey(
        PRIVATE_KEY_MATERIAL,
        'amesh-allow-list-integrity-v1',
        DEVICE_ID,
        32,
      );
      const legacyData = {
        version: '2.0.0',
        devices: [
          {
            deviceId: 'am_legacy',
            publicKey: content.devices[0].publicKey,
            friendlyName: 'Legacy',
            addedAt: content.devices[0].addedAt,
            addedBy: 'handshake',
          },
        ],
        updatedAt: new Date().toISOString(),
      };
      const canonical = JSON.stringify({
        version: legacyData.version,
        devices: legacyData.devices,
        updatedAt: legacyData.updatedAt,
      });
      const hmac = computeHmac(hmacKey, new TextEncoder().encode(canonical));
      const fileData = { ...legacyData, hmac: Buffer.from(hmac).toString('base64') };
      await writeFile(filePath(), JSON.stringify(fileData, null, 2));

      // Now read — should migrate and add role: 'controller'
      const al2 = new AllowList(filePath(), PRIVATE_KEY_MATERIAL, DEVICE_ID);
      const data = await al2.read();
      expect(data.devices[0].role).toBe('controller');
    });
  });

  describe('HMAC integrity — adversarial', () => {
    it('rejects file with manually added device', async () => {
      const al = new AllowList(filePath(), PRIVATE_KEY_MATERIAL, DEVICE_ID);
      await al.read(); // create sealed file

      // Attacker directly edits the JSON
      const content = JSON.parse(await readFile(filePath(), 'utf-8'));
      content.devices.push({
        deviceId: 'am_evil',
        publicKey: 'ATTACKERKEY==',
        friendlyName: 'Evil Device',
        addedAt: new Date().toISOString(),
        addedBy: 'manual',
      });
      await writeFile(filePath(), JSON.stringify(content));

      // Read should fail HMAC check
      const al2 = new AllowList(filePath(), PRIVATE_KEY_MATERIAL, DEVICE_ID);
      await expect(al2.read()).rejects.toThrow(/integrity check failed/);
    });

    it('rejects file with modified device name', async () => {
      const al = new AllowList(filePath(), PRIVATE_KEY_MATERIAL, DEVICE_ID);
      await al.addDevice(makeDevice('am_legit', 'Legit Device'));

      const content = JSON.parse(await readFile(filePath(), 'utf-8'));
      content.devices[0].friendlyName = 'Hijacked Device';
      await writeFile(filePath(), JSON.stringify(content));

      const al2 = new AllowList(filePath(), PRIVATE_KEY_MATERIAL, DEVICE_ID);
      await expect(al2.read()).rejects.toThrow(/integrity check failed/);
    });

    it('rejects file with modified updatedAt', async () => {
      const al = new AllowList(filePath(), PRIVATE_KEY_MATERIAL, DEVICE_ID);
      await al.read();

      const content = JSON.parse(await readFile(filePath(), 'utf-8'));
      content.updatedAt = '2099-01-01T00:00:00.000Z';
      await writeFile(filePath(), JSON.stringify(content));

      const al2 = new AllowList(filePath(), PRIVATE_KEY_MATERIAL, DEVICE_ID);
      await expect(al2.read()).rejects.toThrow(/integrity check failed/);
    });

    it('rejects file with swapped HMAC from different key', async () => {
      const al = new AllowList(filePath(), PRIVATE_KEY_MATERIAL, DEVICE_ID);
      await al.read();

      // Attacker creates a valid HMAC but with different key material
      const differentKey = new Uint8Array(32).fill(0xcd);
      const alEvil = new AllowList(join(tempDir, 'evil_list.json'), differentKey, DEVICE_ID);
      const evilData = await alEvil.read();

      // Copy evil HMAC to legitimate file
      const content = JSON.parse(await readFile(filePath(), 'utf-8'));
      content.hmac = evilData.hmac;
      await writeFile(filePath(), JSON.stringify(content));

      const al2 = new AllowList(filePath(), PRIVATE_KEY_MATERIAL, DEVICE_ID);
      await expect(al2.read()).rejects.toThrow(/integrity check failed/);
    });

    it('rejects completely empty HMAC', async () => {
      const al = new AllowList(filePath(), PRIVATE_KEY_MATERIAL, DEVICE_ID);
      await al.read();

      const content = JSON.parse(await readFile(filePath(), 'utf-8'));
      content.hmac = '';
      await writeFile(filePath(), JSON.stringify(content));

      const al2 = new AllowList(filePath(), PRIVATE_KEY_MATERIAL, DEVICE_ID);
      await expect(al2.read()).rejects.toThrow(/integrity check failed/);
    });
  });

  describe('canonical JSON — L5', () => {
    it('HMAC is independent of key insertion order', async () => {
      // Write a device via the AllowList API, which builds objects in one
      // order. Then re-write the same file with keys in a different order —
      // the HMAC from the first write must still verify because the
      // canonicalizer sorts keys.
      const al = new AllowList(filePath(), PRIVATE_KEY_MATERIAL, DEVICE_ID);
      await al.addDevice(makeDevice('am_reorder', 'Reorder Test'));

      const content = JSON.parse(await readFile(filePath(), 'utf-8'));
      // Rebuild the object with keys in reverse alphabetical order
      const reordered = {
        version: content.version,
        devices: content.devices.map((d: Record<string, unknown>) => {
          // Reverse-sort the device keys
          const keys = Object.keys(d).sort().reverse();
          const out: Record<string, unknown> = {};
          for (const k of keys) out[k] = d[k];
          return out;
        }),
        updatedAt: content.updatedAt,
        hmac: content.hmac, // same HMAC from the original write
      };
      await writeFile(filePath(), JSON.stringify(reordered, null, 2));

      // Read must still succeed — the canonicalizer sorts keys before HMAC.
      const al2 = new AllowList(filePath(), PRIVATE_KEY_MATERIAL, DEVICE_ID);
      const data = await al2.read();
      expect(data.devices[0].deviceId).toBe('am_reorder');
    });

    it('re-seals legacy (pre-L5) HMACs on first read', async () => {
      // Write a file sealed with the legacy JSON.stringify canonical,
      // verify it loads, then confirm the file on disk has been re-sealed
      // with the new deterministic canonical (the HMAC value changes).
      const { computeHmac, deriveKey } = await import('@authmesh/core');
      const hmacKey = deriveKey(
        PRIVATE_KEY_MATERIAL,
        'amesh-allow-list-integrity-v1',
        DEVICE_ID,
        32,
      );
      const legacyData = {
        version: '2.0.0',
        devices: [
          {
            deviceId: 'am_legacy_l5',
            publicKey: 'AAAA',
            friendlyName: 'Legacy L5',
            addedAt: '2026-01-01T00:00:00.000Z',
            addedBy: 'handshake',
            role: 'controller',
          },
        ],
        updatedAt: '2026-01-01T00:00:00.000Z',
      };
      // Legacy canonical: plain JSON.stringify of the specific-keyed object
      const legacyCanonical = JSON.stringify({
        version: legacyData.version,
        devices: legacyData.devices,
        updatedAt: legacyData.updatedAt,
      });
      const legacyHmac = computeHmac(hmacKey, new TextEncoder().encode(legacyCanonical));
      await writeFile(
        filePath(),
        JSON.stringify({ ...legacyData, hmac: Buffer.from(legacyHmac).toString('base64') }, null, 2),
      );

      // Read must accept the legacy HMAC
      const al = new AllowList(filePath(), PRIVATE_KEY_MATERIAL, DEVICE_ID);
      const data = await al.read();
      expect(data.devices[0].deviceId).toBe('am_legacy_l5');

      // File on disk should now have a fresh HMAC (new canonical)
      const afterRead = JSON.parse(await readFile(filePath(), 'utf-8'));
      expect(afterRead.hmac).not.toBe(Buffer.from(legacyHmac).toString('base64'));

      // And subsequent reads should verify using the new canonical only
      const al2 = new AllowList(filePath(), PRIVATE_KEY_MATERIAL, DEVICE_ID);
      const reread = await al2.read();
      expect(reread.devices[0].deviceId).toBe('am_legacy_l5');
    });
  });
});
