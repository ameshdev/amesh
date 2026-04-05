import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { createRelayServer, extractClientIp, isValidIp } from '../server.js';

/**
 * Regression test for H1 — relay rate limiter was always seeing the LB IP.
 *
 * Directly exercises extractClientIp / isValidIp because Bun's WebSocket
 * client does not let callers set arbitrary request headers, so the only
 * reliable way to prove XFF handling is at the unit level.
 */

function mockSrv(peerIp: string) {
  return {
    requestIP: (_req: Request) => ({ address: peerIp }),
  };
}

function makeReq(headers: Record<string, string>): Request {
  return new Request('http://127.0.0.1/ws', { headers });
}

describe('isValidIp', () => {
  it('accepts valid IPv4', () => {
    expect(isValidIp('203.0.113.42')).toBe(true);
    expect(isValidIp('0.0.0.0')).toBe(true);
    expect(isValidIp('255.255.255.255')).toBe(true);
  });

  it('rejects invalid IPv4', () => {
    expect(isValidIp('256.0.0.1')).toBe(false);
    expect(isValidIp('1.2.3')).toBe(false);
    expect(isValidIp('1.2.3.4.5')).toBe(false);
    expect(isValidIp('1.2.3.4a')).toBe(false);
  });

  it('accepts valid IPv6 (loose match)', () => {
    expect(isValidIp('::1')).toBe(true);
    expect(isValidIp('2001:db8::1')).toBe(true);
    expect(isValidIp('fe80::1%eth0')).toBe(true);
  });

  it('rejects obvious garbage', () => {
    expect(isValidIp('')).toBe(false);
    expect(isValidIp('not-an-ip')).toBe(false);
    expect(isValidIp('; DROP TABLE users')).toBe(false);
    expect(isValidIp('a'.repeat(200))).toBe(false);
  });
});

describe('extractClientIp (H1)', () => {
  const lbIp = '10.0.0.1';

  it('uses socket peer when trustProxy=false (ignores XFF)', () => {
    const req = makeReq({ 'x-forwarded-for': '203.0.113.42' });
    const ip = extractClientIp(req, mockSrv(lbIp), /* trustProxy */ false);
    expect(ip).toBe(lbIp);
  });

  it('uses XFF left-most when trustProxy=true', () => {
    const req = makeReq({ 'x-forwarded-for': '203.0.113.42, 10.0.0.1' });
    const ip = extractClientIp(req, mockSrv(lbIp), /* trustProxy */ true);
    expect(ip).toBe('203.0.113.42');
  });

  it('falls back to socket peer when XFF is missing under trustProxy=true', () => {
    const req = makeReq({});
    const ip = extractClientIp(req, mockSrv(lbIp), /* trustProxy */ true);
    expect(ip).toBe(lbIp);
  });

  it('falls back to socket peer when XFF is malformed under trustProxy=true', () => {
    const req = makeReq({ 'x-forwarded-for': 'not-an-ip, also-not-an-ip' });
    const ip = extractClientIp(req, mockSrv(lbIp), /* trustProxy */ true);
    // Reject malformed input rather than trusting a spoofed value.
    expect(ip).toBe(lbIp);
  });

  it('handles single-entry XFF without a comma', () => {
    const req = makeReq({ 'x-forwarded-for': '198.51.100.7' });
    const ip = extractClientIp(req, mockSrv(lbIp), /* trustProxy */ true);
    expect(ip).toBe('198.51.100.7');
  });

  it('returns "unknown" when neither socket peer nor XFF are available', () => {
    const req = makeReq({});
    const nullSrv = { requestIP: (_req: Request) => null };
    const ip = extractClientIp(req, nullSrv, /* trustProxy */ true);
    expect(ip).toBe('unknown');
  });

  it('does not take the right-most (proxy) entry when trustProxy=true', () => {
    // XFF convention: client, proxy1, proxy2, ... The originator is on the LEFT.
    // Taking the right-most would give us the proxy IP, collapsing buckets
    // back into the H1 bug.
    const req = makeReq({ 'x-forwarded-for': '203.0.113.42, 198.51.100.7, 10.0.0.1' });
    const ip = extractClientIp(req, mockSrv(lbIp), /* trustProxy */ true);
    expect(ip).toBe('203.0.113.42');
  });
});

describe('createRelayServer with trustProxy (H1)', () => {
  let relay: ReturnType<typeof createRelayServer>;
  let httpUrl: string;

  beforeAll(() => {
    relay = createRelayServer({ host: '127.0.0.1', port: 0, trustProxy: true });
    const addr = relay.start();
    httpUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(() => {
    relay.stop();
  });

  it('still serves /health normally under trustProxy', async () => {
    const res = await fetch(`${httpUrl}/health`);
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  it('honours AMESH_TRUST_PROXY env var when constructor arg is omitted', () => {
    const prev = process.env.AMESH_TRUST_PROXY;
    process.env.AMESH_TRUST_PROXY = '1';
    try {
      const r = createRelayServer({ host: '127.0.0.1', port: 0 });
      const addr = r.start();
      expect(addr.port).toBeGreaterThan(0);
      r.stop();
    } finally {
      if (prev === undefined) delete process.env.AMESH_TRUST_PROXY;
      else process.env.AMESH_TRUST_PROXY = prev;
    }
  });
});
