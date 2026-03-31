/**
 * Unified keystore interface for all hardware and software backends.
 *
 * The private key NEVER leaves the KeyStore. The sign() method takes a
 * message and returns a signature — the key itself is never returned.
 */
export interface KeyStore {
  /** Generate a P-256 keypair and store the private key. Returns compressed public key (33 bytes). */
  generateAndStore(deviceId: string): Promise<{ publicKey: Uint8Array }>;

  /** Sign a message with ECDSA-P256-SHA256. Returns raw r||s signature (64 bytes). */
  sign(deviceId: string, message: Uint8Array): Promise<Uint8Array>;

  /** Get the compressed P-256 public key (33 bytes) for a device. */
  getPublicKey(deviceId: string): Promise<Uint8Array>;

  /**
   * Get secret key material for HMAC-sealing the allow list.
   *
   * For software keystores this is derived from the private key via HKDF.
   * For hardware keystores (where the private key cannot be exported), a
   * random secret is generated once and stored alongside the key with
   * restrictive file permissions.
   */
  getHmacKeyMaterial(deviceId: string): Promise<Uint8Array>;

  /** Delete a key from the store. */
  delete(deviceId: string): Promise<void>;

  /** Human-readable name for the storage backend. */
  readonly backendName: string;
}
