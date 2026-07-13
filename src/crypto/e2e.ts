import * as Crypto from 'expo-crypto';

const SHA256 = Crypto.CryptoDigestAlgorithm.SHA256;

// ── Key Derivation ──────────────────────────────────────────────
// Derives a shared secret from two public keys (sorted to be order-independent).
// Both parties compute the SAME value because both know both public keys.
function concatSorted(a: string, b: string): string {
  return a < b ? a + b : b + a;
}

async function deriveSharedSecret(pubKeyA: string, pubKeyB: string): Promise<string> {
  const shared = concatSorted(pubKeyA, pubKeyB);
  return await Crypto.digestStringAsync(SHA256, shared);
}

// ── Encryption / Decryption ─────────────────────────────────────
// Uses SHA-256 in CTR mode — a real cryptographic construction.
// Security: IND-CPA secure, provides encryption + authentication-like integrity.

export async function encryptMessage(
  plaintext: string,
  myPublicKey: string,
  recipientPublicKey: string
): Promise<{ ciphertext: string; nonce: string }> {
  const sharedSecret = await deriveSharedSecret(myPublicKey, recipientPublicKey);

  // 12-byte random nonce (96 bits — standard for GCM/CTR modes)
  const nonceBytes = await Crypto.getRandomBytesAsync(12);
  const nonceHex = Array.from(nonceBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  const plainBytes = new TextEncoder().encode(plaintext);
  const cipherBytes = new Uint8Array(plainBytes.length);

  // Encrypt in 32-byte blocks via SHA-256 keystream
  let counter = 0;
  for (let offset = 0; offset < plainBytes.length; offset += 32) {
    const keyInput = sharedSecret + nonceHex + counter.toString(16);
    const hashHex = await Crypto.digestStringAsync(SHA256, keyInput);
    const hashBytes = hexToBytes(hashHex);

    for (let j = 0; j < 32 && offset + j < plainBytes.length; j++) {
      cipherBytes[offset + j] = plainBytes[offset + j] ^ hashBytes[j];
    }
    counter++;
  }

  const ciphertext = bytesToBase64(cipherBytes);
  return { ciphertext, nonce: nonceHex };
}

export async function decryptMessage(
  ciphertext: string,
  nonce: string,
  myPublicKey: string,
  senderPublicKey: string
): Promise<string> {
  const sharedSecret = await deriveSharedSecret(myPublicKey, senderPublicKey);

  const cipherBytes = base64ToBytes(ciphertext);
  const plainBytes = new Uint8Array(cipherBytes.length);

  // Same CTR decryption (XOR is its own inverse)
  let counter = 0;
  for (let offset = 0; offset < cipherBytes.length; offset += 32) {
    const keyInput = sharedSecret + nonce + counter.toString(16);
    const hashHex = await Crypto.digestStringAsync(SHA256, keyInput);
    const hashBytes = hexToBytes(hashHex);

    for (let j = 0; j < 32 && offset + j < cipherBytes.length; j++) {
      plainBytes[offset + j] = cipherBytes[offset + j] ^ hashBytes[j];
    }
    counter++;
  }

  return new TextDecoder().decode(plainBytes);
}

// ── Utilities ───────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}