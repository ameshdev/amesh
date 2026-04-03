import { describe, it, expect } from 'bun:test';
import {
  FrameType,
  encodeDataFrame,
  encodeResizeFrame,
  encodeExitFrame,
  encodePingFrame,
  encodePongFrame,
  encodeCommandFrame,
  parseFrame,
  parseResize,
  parseExit,
} from '../frame.js';

describe('frame protocol', () => {
  it('encodes and parses data frame', () => {
    const data = new TextEncoder().encode('hello');
    const frame = encodeDataFrame(data);
    const parsed = parseFrame(frame);
    expect(parsed.type).toBe(FrameType.DATA);
    expect(new TextDecoder().decode(parsed.payload)).toBe('hello');
  });

  it('encodes and parses resize frame', () => {
    const frame = encodeResizeFrame(120, 40);
    const parsed = parseFrame(frame);
    expect(parsed.type).toBe(FrameType.RESIZE);
    const { cols, rows } = parseResize(parsed.payload);
    expect(cols).toBe(120);
    expect(rows).toBe(40);
  });

  it('encodes and parses exit frame', () => {
    const frame = encodeExitFrame(42);
    const parsed = parseFrame(frame);
    expect(parsed.type).toBe(FrameType.EXIT);
    const { code } = parseExit(parsed.payload);
    expect(code).toBe(42);
  });

  it('handles negative exit codes', () => {
    const frame = encodeExitFrame(-1);
    const { code } = parseExit(parseFrame(frame).payload);
    expect(code).toBe(-1);
  });

  it('encodes and parses ping/pong frames', () => {
    expect(parseFrame(encodePingFrame()).type).toBe(FrameType.PING);
    expect(parseFrame(encodePongFrame()).type).toBe(FrameType.PONG);
  });

  it('encodes and parses command frame', () => {
    const frame = encodeCommandFrame('uptime');
    const parsed = parseFrame(frame);
    expect(parsed.type).toBe(FrameType.COMMAND);
    expect(new TextDecoder().decode(parsed.payload)).toBe('uptime');
  });

  it('rejects empty frame', () => {
    expect(() => parseFrame(new Uint8Array(0))).toThrow('Empty frame');
  });
});
