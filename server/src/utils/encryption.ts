/**
 * Encryption Bridge — re-exports the canonical AES-256-GCM token-crypto
 * functions so legacy import paths (`../utils/encryption.js`) keep
 * resolving without duplicating crypto logic.
 *
 * All ciphertext is produced by services/token-crypto.ts — this file is a
 * deliberate one-line indirection (see dev_reports/19_05/INDEX.md, S1.2).
 * Adding logic here is forbidden: do it in token-crypto.ts so every caller
 * stays in sync.
 */

export { encryptToken, decryptToken } from '../services/token-crypto.js';
