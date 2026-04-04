import { describe, it, expect } from 'bun:test';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { buildCanonicalString } from '../canonical.js';

const emptyBodyHash = bytesToHex(sha256(new Uint8Array(0)));

describe('buildCanonicalString', () => {
  it('builds correct format with all fields', () => {
    const result = buildCanonicalString('POST', '/api/data', '1743160800', 'abc123', '{"a":1}');
    const lines = result.split('\n');
    expect(lines).toHaveLength(6);
    expect(lines[0]).toBe('AMv1');
    expect(lines[1]).toBe('POST');
    expect(lines[2]).toBe('/api/data');
    expect(lines[3]).toBe('1743160800');
    expect(lines[4]).toBe('abc123');
    expect(lines[5]).toHaveLength(64); // hex SHA-256
  });

  it('uppercases HTTP method', () => {
    const lower = buildCanonicalString('post', '/path', '100', 'n', '');
    const upper = buildCanonicalString('POST', '/path', '100', 'n', '');
    expect(lower).toBe(upper);
  });

  it('handles mixed-case methods', () => {
    const result = buildCanonicalString('PaTcH', '/path', '100', 'n', '');
    expect(result.split('\n')[1]).toBe('PATCH');
  });

  it('sorts query parameters alphabetically', () => {
    const result = buildCanonicalString('GET', '/api?b=2&a=1', '100', 'n', '');
    expect(result.split('\n')[2]).toBe('/api?a=1&b=2');
  });

  it('sorts multiple query parameters', () => {
    const result = buildCanonicalString('GET', '/api?z=3&a=1&m=2&b=4', '100', 'n', '');
    expect(result.split('\n')[2]).toBe('/api?a=1&b=4&m=2&z=3');
  });

  it('preserves path without query string', () => {
    const result = buildCanonicalString('GET', '/api/users/123', '100', 'n', '');
    expect(result.split('\n')[2]).toBe('/api/users/123');
  });

  it('handles empty query string after ?', () => {
    const result = buildCanonicalString('GET', '/api?', '100', 'n', '');
    expect(result.split('\n')[2]).toBe('/api');
  });

  it('uses SHA-256 of empty string for no body (default)', () => {
    const result = buildCanonicalString('GET', '/path', '100', 'n');
    expect(result.split('\n')[5]).toBe(emptyBodyHash);
  });

  it('uses SHA-256 of empty string for explicit empty string body', () => {
    const result = buildCanonicalString('GET', '/path', '100', 'n', '');
    expect(result.split('\n')[5]).toBe(emptyBodyHash);
  });

  it('hashes string body correctly', () => {
    const body = '{"amount":100}';
    const expectedHash = bytesToHex(sha256(new TextEncoder().encode(body)));
    const result = buildCanonicalString('POST', '/path', '100', 'n', body);
    expect(result.split('\n')[5]).toBe(expectedHash);
  });

  it('hashes Uint8Array body correctly', () => {
    const body = new TextEncoder().encode('{"amount":100}');
    const expectedHash = bytesToHex(sha256(body));
    const result = buildCanonicalString('POST', '/path', '100', 'n', body);
    expect(result.split('\n')[5]).toBe(expectedHash);
  });

  it('string and Uint8Array produce same hash for same content', () => {
    const str = '{"test":true}';
    const bytes = new TextEncoder().encode(str);
    const r1 = buildCanonicalString('POST', '/p', '1', 'n', str);
    const r2 = buildCanonicalString('POST', '/p', '1', 'n', bytes);
    expect(r1).toBe(r2);
  });

  it('has no trailing newline', () => {
    const result = buildCanonicalString('GET', '/', '1', 'n', '');
    expect(result.endsWith('\n')).toBe(false);
  });

  // Spec Appendix A test vector
  it('matches spec test vector', () => {
    const body = '{"amount":100}';
    const result = buildCanonicalString(
      'POST',
      '/api/orders?b=2&a=1',
      '1743160800',
      'dGVzdG5vbmNl',
      body,
    );
    const lines = result.split('\n');
    expect(lines[0]).toBe('AMv1');
    expect(lines[1]).toBe('POST');
    expect(lines[2]).toBe('/api/orders?a=1&b=2');
    expect(lines[3]).toBe('1743160800');
    expect(lines[4]).toBe('dGVzdG5vbmNl');
    expect(lines[5]).toBe(bytesToHex(sha256(new TextEncoder().encode(body))));
  });

  // Adversarial: changing any single field must produce different canonical string
  it('differs when method changes', () => {
    const base = buildCanonicalString('GET', '/p', '1', 'n', '');
    const diff = buildCanonicalString('POST', '/p', '1', 'n', '');
    expect(base).not.toBe(diff);
  });

  it('differs when path changes', () => {
    const base = buildCanonicalString('GET', '/a', '1', 'n', '');
    const diff = buildCanonicalString('GET', '/b', '1', 'n', '');
    expect(base).not.toBe(diff);
  });

  it('differs when timestamp changes', () => {
    const base = buildCanonicalString('GET', '/p', '1', 'n', '');
    const diff = buildCanonicalString('GET', '/p', '2', 'n', '');
    expect(base).not.toBe(diff);
  });

  it('differs when nonce changes', () => {
    const base = buildCanonicalString('GET', '/p', '1', 'a', '');
    const diff = buildCanonicalString('GET', '/p', '1', 'b', '');
    expect(base).not.toBe(diff);
  });

  it('differs when body changes', () => {
    const base = buildCanonicalString('POST', '/p', '1', 'n', 'a');
    const diff = buildCanonicalString('POST', '/p', '1', 'n', 'b');
    expect(base).not.toBe(diff);
  });
});
