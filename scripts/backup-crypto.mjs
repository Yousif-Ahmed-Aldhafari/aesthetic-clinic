import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';

export const BACKUP_CIPHER = 'aes-256-gcm';
export const KDF_ALGORITHM = 'scrypt';
export const SALT_BYTES = 32;
export const IV_BYTES = 12;
export const AUTH_TAG_BYTES = 16;
export const KEY_BYTES = 32;

export function calculateSha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function deriveBackupKey(passphrase, salt) {
  if (!passphrase || typeof passphrase !== 'string') {
    throw new Error('BACKUP_ENCRYPTION_KEY must be a non-empty string.');
  }
  const saltBuf = Buffer.isBuffer(salt) ? salt : Buffer.from(salt, 'hex');
  return scryptSync(passphrase, saltBuf, KEY_BYTES, { N: 16384, r: 8, p: 1 });
}

export function encryptBackup(plaintextBuffer, passphrase) {
  if (!Buffer.isBuffer(plaintextBuffer)) {
    throw new TypeError('plaintextBuffer must be a Buffer.');
  }
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = deriveBackupKey(passphrase, salt);

  const cipher = createCipheriv(BACKUP_CIPHER, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintextBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const ciphertextSha256 = calculateSha256(ciphertext);

  return {
    ciphertext,
    meta: {
      cipher: BACKUP_CIPHER,
      kdf: KDF_ALGORITHM,
      kdfSalt: salt.toString('hex'),
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      ciphertextSha256,
      plaintextSize: plaintextBuffer.length,
      ciphertextSize: ciphertext.length,
    },
  };
}

export function decryptBackup(ciphertextBuffer, passphrase, meta) {
  if (!Buffer.isBuffer(ciphertextBuffer)) {
    throw new TypeError('ciphertextBuffer must be a Buffer.');
  }
  if (!meta || !meta.kdfSalt || !meta.iv || !meta.authTag) {
    throw new Error('Invalid metadata: kdfSalt, iv, and authTag are required.');
  }

  // Verify ciphertext SHA-256 before decryption
  if (meta.ciphertextSha256) {
    const computedHash = calculateSha256(ciphertextBuffer);
    if (computedHash !== meta.ciphertextSha256) {
      throw new Error(`Integrity check failed: ciphertext SHA-256 mismatch (expected ${meta.ciphertextSha256}, got ${computedHash}). Possible corruption or tampering.`);
    }
  }

  const salt = Buffer.from(meta.kdfSalt, 'hex');
  const iv = Buffer.from(meta.iv, 'hex');
  const authTag = Buffer.from(meta.authTag, 'hex');
  const key = deriveBackupKey(passphrase, salt);

  const decipher = createDecipheriv(BACKUP_CIPHER, key, iv);
  decipher.setAuthTag(authTag);

  try {
    const plaintext = Buffer.concat([decipher.update(ciphertextBuffer), decipher.final()]);
    return plaintext;
  } catch (error) {
    throw new Error(`Decryption failed: authentication tag verification failed (${error.message}). Ciphertext may have been modified or wrong passphrase supplied.`);
  }
}
