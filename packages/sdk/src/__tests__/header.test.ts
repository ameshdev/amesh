import { describe, it, expect } from 'bun:test';
import { buildAuthHeader, parseAuthHeader } from '../header.js';

describe('buildAuthHeader', () => {
  it('builds correct format', () => {
    const header = buildAuthHeader({
      v: '1',
      id: 'pubkey123',
      ts: '1743160800',
      nonce: 'abc123',
      sig: 'sig456',
    });
    expect(header).toBe(
      'AuthMesh v="1",id="pubkey123",ts="1743160800",nonce="abc123",sig="sig456"',
    );
  });
});

describe('parseAuthHeader', () => {
  it('parses a valid header', () => {
    const header = 'AuthMesh v="1",id="pk",ts="100",nonce="n",sig="s"';
    const parsed = parseAuthHeader(header);
    expect(parsed).toEqual({ v: '1', id: 'pk', ts: '100', nonce: 'n', sig: 's' });
  });

  it('returns null for undefined', () => {
    expect(parseAuthHeader(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseAuthHeader('')).toBeNull();
  });

  it('returns null for Bearer token', () => {
    expect(parseAuthHeader('Bearer abc123')).toBeNull();
  });

  it('returns null for missing fields', () => {
    expect(parseAuthHeader('AuthMesh v="1",id="pk"')).toBeNull();
  });

  it('round-trips with buildAuthHeader', () => {
    const parts = { v: '1', id: 'key', ts: '999', nonce: 'nnn', sig: 'sss' };
    const header = buildAuthHeader(parts);
    expect(parseAuthHeader(header)).toEqual(parts);
  });

  // L2 hardening regression tests

  it('rejects duplicate keys (v="1",v="2")', () => {
    const header = 'AuthMesh v="1",v="2",id="pk",ts="100",nonce="n",sig="s"';
    expect(parseAuthHeader(header)).toBeNull();
  });

  it('rejects unknown keys', () => {
    const header = 'AuthMesh v="1",id="pk",ts="100",nonce="n",sig="s",extra="x"';
    expect(parseAuthHeader(header)).toBeNull();
  });

  it('rejects headers exceeding MAX_HEADER_LENGTH', () => {
    const huge = 'AuthMesh v="1",id="' + 'x'.repeat(2000) + '",ts="100",nonce="n",sig="s"';
    expect(parseAuthHeader(huge)).toBeNull();
  });

  it('rejects fields exceeding per-field cap', () => {
    // sig has a 256 cap; 300 chars should be rejected
    const header = `AuthMesh v="1",id="pk",ts="100",nonce="n",sig="${'x'.repeat(300)}"`;
    expect(parseAuthHeader(header)).toBeNull();
  });

  it('rejects ts larger than 16 chars', () => {
    // ts is Unix seconds; 16 digits covers year 5138. More is adversarial.
    const header = `AuthMesh v="1",id="pk",ts="${'9'.repeat(20)}",nonce="n",sig="s"`;
    expect(parseAuthHeader(header)).toBeNull();
  });
});
