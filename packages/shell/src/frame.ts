/**
 * Shell frame protocol — binary frames over the encrypted tunnel.
 *
 * Each frame is: type_byte (1B) || payload (variable)
 * The entire frame is then encrypted with ShellCipher before transmission.
 */

export const FrameType = {
  DATA: 0x01,     // Raw terminal bytes (stdin/stdout)
  RESIZE: 0x02,   // Terminal resize: { cols: u16, rows: u16 } (4 bytes BE)
  EXIT: 0x03,     // Process exit: { code: i32 } (4 bytes BE)
  PING: 0x04,     // Keepalive ping (empty payload)
  PONG: 0x05,     // Keepalive pong (empty payload)
  COMMAND: 0x06,  // Single command for -c mode (UTF-8 string)
} as const;

export type FrameTypeValue = (typeof FrameType)[keyof typeof FrameType];

export function encodeDataFrame(data: Uint8Array): Uint8Array {
  const frame = new Uint8Array(1 + data.length);
  frame[0] = FrameType.DATA;
  frame.set(data, 1);
  return frame;
}

export function encodeResizeFrame(cols: number, rows: number): Uint8Array {
  const frame = new Uint8Array(5);
  frame[0] = FrameType.RESIZE;
  const view = new DataView(frame.buffer);
  view.setUint16(1, cols, false);
  view.setUint16(3, rows, false);
  return frame;
}

export function encodeExitFrame(code: number): Uint8Array {
  const frame = new Uint8Array(5);
  frame[0] = FrameType.EXIT;
  const view = new DataView(frame.buffer);
  view.setInt32(1, code, false);
  return frame;
}

export function encodePingFrame(): Uint8Array {
  return new Uint8Array([FrameType.PING]);
}

export function encodePongFrame(): Uint8Array {
  return new Uint8Array([FrameType.PONG]);
}

export function encodeCommandFrame(command: string): Uint8Array {
  const encoded = new TextEncoder().encode(command);
  const frame = new Uint8Array(1 + encoded.length);
  frame[0] = FrameType.COMMAND;
  frame.set(encoded, 1);
  return frame;
}

export function parseFrame(frame: Uint8Array): { type: FrameTypeValue; payload: Uint8Array } {
  if (frame.length < 1) throw new Error('Empty frame');
  return {
    type: frame[0] as FrameTypeValue,
    payload: frame.subarray(1),
  };
}

export function parseResize(payload: Uint8Array): { cols: number; rows: number } {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  return { cols: view.getUint16(0, false), rows: view.getUint16(2, false) };
}

export function parseExit(payload: Uint8Array): { code: number } {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  return { code: view.getInt32(0, false) };
}
