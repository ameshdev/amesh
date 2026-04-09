/**
 * Shell frame protocol — binary frames over the encrypted tunnel.
 *
 * Each frame is: type_byte (1B) || payload (variable)
 * The entire frame is then encrypted with ShellCipher before transmission.
 */

export const FrameType = {
  DATA: 0x01, // Raw terminal bytes (stdin/stdout)
  RESIZE: 0x02, // Terminal resize: { cols: u16, rows: u16 } (4 bytes BE)
  EXIT: 0x03, // Process exit: { code: i32 } (4 bytes BE)
  PING: 0x04, // Keepalive ping (empty payload)
  PONG: 0x05, // Keepalive pong (empty payload)
  COMMAND: 0x06, // Single command for -c mode (UTF-8 string)
  FILE_META: 0x10, // File transfer metadata (JSON: path, size, mode)
  FILE_CHUNK: 0x11, // File data chunk (raw bytes)
  FILE_ACK: 0x12, // File transfer acknowledgement (1 byte: 0=ok, 1=error + optional message)
  FILE_ERROR: 0x13, // File transfer error (UTF-8 error message)
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

const VALID_FRAME_TYPES = new Set<number>([
  FrameType.DATA,
  FrameType.RESIZE,
  FrameType.EXIT,
  FrameType.PING,
  FrameType.PONG,
  FrameType.COMMAND,
  FrameType.FILE_META,
  FrameType.FILE_CHUNK,
  FrameType.FILE_ACK,
  FrameType.FILE_ERROR,
]);

export function parseFrame(frame: Uint8Array): { type: FrameTypeValue; payload: Uint8Array } {
  if (frame.length < 1) throw new Error('Empty frame');
  if (!VALID_FRAME_TYPES.has(frame[0]))
    throw new Error(`Unknown frame type: 0x${frame[0].toString(16)}`);
  return {
    type: frame[0] as FrameTypeValue,
    payload: frame.subarray(1),
  };
}

export function parseResize(payload: Uint8Array): { cols: number; rows: number } {
  if (payload.byteLength < 4) throw new Error('RESIZE frame too short');
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  return { cols: view.getUint16(0, false), rows: view.getUint16(2, false) };
}

export function parseExit(payload: Uint8Array): { code: number } {
  if (payload.byteLength < 4) throw new Error('EXIT frame too short');
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  return { code: view.getInt32(0, false) };
}

// --- File transfer frames ---

export interface FileMeta {
  path: string;
  size: number;
  mode?: number;
}

export function encodeFileMetaFrame(meta: FileMeta): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(meta));
  const frame = new Uint8Array(1 + json.length);
  frame[0] = FrameType.FILE_META;
  frame.set(json, 1);
  return frame;
}

export function parseFileMeta(payload: Uint8Array): FileMeta {
  return JSON.parse(new TextDecoder().decode(payload));
}

export function encodeFileChunkFrame(data: Uint8Array): Uint8Array {
  const frame = new Uint8Array(1 + data.length);
  frame[0] = FrameType.FILE_CHUNK;
  frame.set(data, 1);
  return frame;
}

export function encodeFileAckFrame(): Uint8Array {
  return new Uint8Array([FrameType.FILE_ACK, 0]);
}

export function encodeFileErrorFrame(message: string): Uint8Array {
  const encoded = new TextEncoder().encode(message);
  const frame = new Uint8Array(1 + encoded.length);
  frame[0] = FrameType.FILE_ERROR;
  frame.set(encoded, 1);
  return frame;
}
