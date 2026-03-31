export interface AuthMeshIdentity {
  deviceId: string;
  friendlyName: string;
  verifiedAt: number; // Unix seconds
}

export interface AuthMeshHeader {
  v: string;
  id: string; // Base64URL of compressed P-256 public key
  ts: string; // Unix timestamp in seconds
  nonce: string; // Base64URL of 16 random bytes
  sig: string; // Base64URL of ECDSA-P256 signature (r||s, 64 bytes)
}
