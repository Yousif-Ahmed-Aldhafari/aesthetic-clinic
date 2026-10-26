export interface EncryptedBackupResult {
  ciphertext: Buffer;
  meta: {
    cipher: string;
    kdf: string;
    kdfSalt: string;
    iv: string;
    authTag: string;
    ciphertextSha256: string;
    plaintextSize: number;
    ciphertextSize: number;
  };
}

export function calculateSha256(buffer: Buffer): string;
export function deriveBackupKey(passphrase: string, salt: Buffer | string): Buffer;
export function encryptBackup(plaintextBuffer: Buffer, passphrase: string): EncryptedBackupResult;
export function decryptBackup(
  ciphertextBuffer: Buffer,
  passphrase: string,
  meta: {
    kdfSalt: string;
    iv: string;
    authTag: string;
    ciphertextSha256?: string;
  }
): Buffer;

