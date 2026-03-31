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

function makeDevice(id: string, name: string): AllowListDevice {
  return {
    deviceId: id,
    publicKey: Buffer.from(new Uint8Array(33).fill(0x02)).toString('base64'),
    friendlyName: name,
    addedAt: new Date().toISOString(),
    addedBy: 'handshake',
  };
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'amesh-allow-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
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
      const alEvil = new AllowList(
        join(tempDir, 'evil_list.json'),
        differentKey,
        DEVICE_ID,
      );
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
});
