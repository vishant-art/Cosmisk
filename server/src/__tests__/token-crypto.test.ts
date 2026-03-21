import { describe, it, expect } from 'vitest';
import { encryptToken, decryptToken } from '../services/token-crypto.js';

describe('Token Encryption (AES-256-GCM)', () => {
  it('should encrypt and decrypt a token correctly', () => {
    const original = 'EAABsbCS1iHgBOwhatever_meta_token_123';
    const encrypted = encryptToken(original);
    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(original);
  });

  it('should produce different ciphertexts for the same input (random IV)', () => {
    const token = 'same-token-input';
    const enc1 = encryptToken(token);
    const enc2 = encryptToken(token);
    expect(enc1).not.toBe(enc2);
    // But both should decrypt to the same value
    expect(decryptToken(enc1)).toBe(token);
    expect(decryptToken(enc2)).toBe(token);
  });

  it('should produce format iv:authTag:ciphertext', () => {
    const encrypted = encryptToken('test');
    const parts = encrypted.split(':');
    expect(parts).toHaveLength(3);
    // IV is 12 bytes = 24 hex chars
    expect(parts[0]).toHaveLength(24);
    // Auth tag is 16 bytes = 32 hex chars
    expect(parts[1]).toHaveLength(32);
    // Ciphertext should be non-empty hex
    expect(parts[2].length).toBeGreaterThan(0);
    expect(/^[0-9a-f]+$/.test(parts[2])).toBe(true);
  });

  it('should handle empty strings', () => {
    const encrypted = encryptToken('');
    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe('');
  });

  it('should handle long tokens', () => {
    const longToken = 'x'.repeat(2000);
    const encrypted = encryptToken(longToken);
    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(longToken);
  });

  it('should handle special characters and unicode', () => {
    const special = 'token-with-special-chars!@#$%^&*()_+-={}[]|\\:";\'<>?,./~`';
    const decrypted = decryptToken(encryptToken(special));
    expect(decrypted).toBe(special);
  });

  it('should throw on tampered ciphertext', () => {
    const encrypted = encryptToken('test-token');
    const parts = encrypted.split(':');
    // Tamper with the ciphertext
    parts[2] = 'deadbeef' + parts[2].slice(8);
    const tampered = parts.join(':');
    expect(() => decryptToken(tampered)).toThrow();
  });

  it('should throw on tampered auth tag', () => {
    const encrypted = encryptToken('test-token');
    const parts = encrypted.split(':');
    // Tamper with the auth tag
    parts[1] = '0'.repeat(32);
    const tampered = parts.join(':');
    expect(() => decryptToken(tampered)).toThrow();
  });
});
