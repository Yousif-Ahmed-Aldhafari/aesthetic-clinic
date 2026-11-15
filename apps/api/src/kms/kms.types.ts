export type KmsKeyState = 'ACTIVE' | 'RETIRED' | 'DISABLED' | 'REVOKED';
export type KmsKeyAlgorithm = 'AES_256_GCM' | 'AES_256_KW';

export interface KmsKeyMetadata {
  id: string;
  keyId: string;
  version: number;
  state: KmsKeyState;
  algorithm: KmsKeyAlgorithm;
  description?: string | null;
  createdAt: Date;
  rotatedAt?: Date | null;
  revokedAt?: Date | null;
}

export interface KeyWrappingResult {
  keyId: string;
  wrappedKey: string; // Base64 wrapped DEK
  algorithm: KmsKeyAlgorithm;
  iv?: string; // Hex (if AES-256-GCM wrapping is used)
  tag?: string; // Hex (if AES-256-GCM wrapping is used)
}

export interface EncryptedEnvelope {
  version: 'v2';
  keyId: string;
  wrappedDek: string;
  iv: string;
  tag: string;
  ciphertext: string;
  aad?: string;
  algorithm?: KmsKeyAlgorithm;
}

export interface KmsHealthReport {
  ok: boolean;
  provider: string;
  activeKeyId: string | null;
  activeKeyVersion: number | null;
  activeKeyState: KmsKeyState | null;
  latencyMs: number;
  error?: string;
  details?: Record<string, unknown>;
}

export interface KmsProvider {
  readonly providerName: string;
  wrapKey(keyId: string, plaintextDek: Buffer): Promise<KeyWrappingResult>;
  unwrapKey(keyId: string, wrapping: KeyWrappingResult): Promise<Buffer>;
  healthCheck(): Promise<KmsHealthReport>;
}
