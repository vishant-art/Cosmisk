import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { config } from '../config.js';

const ALGORITHM = 'aes-256-gcm';

function getKey(): Buffer {
  const key = config.tokenEncryptionKey;
  // Pad or hash to 32 bytes
  const buf = Buffer.alloc(32);
  Buffer.from(key).copy(buf);
  return buf;
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decryptToken(stored: string): string {
  const [ivHex, authTagHex, ciphertext] = stored.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
