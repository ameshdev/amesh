import { describe, it, expect } from 'vitest';
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
    expect(header).toBe('AuthMesh v="1",id="pubkey123",ts="1743160800",nonce="abc123",sig="sig456"');
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
});
