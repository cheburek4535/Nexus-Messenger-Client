import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const SHA256 = Crypto.CryptoDigestAlgorithm.SHA256;
const DB_ENCRYPTION_KEY = 'nexus_db_encryption_key';

// Генерирует или получает мастер-ключ для шифрования локальной БД
async function getOrCreateEncryptionKey(): Promise<string> {
  try {
    let key: string | null;
    if (Platform.OS === 'web') {
      key = localStorage.getItem(DB_ENCRYPTION_KEY);
    } else {
      key = await SecureStore.getItemAsync(DB_ENCRYPTION_KEY);
    }

    if (!key) {
      const randomBytes = await Crypto.getRandomBytesAsync(32);
      const seed = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
      const newKey = await Crypto.digestStringAsync(SHA256, seed);

      if (Platform.OS === 'web') {
        localStorage.setItem(DB_ENCRYPTION_KEY, newKey);
      } else {
        await SecureStore.setItemAsync(DB_ENCRYPTION_KEY, newKey);
      }

      return newKey;
    }

    return key;
  } catch (error) {
    console.error('Failed to get/create encryption key:', error);
    throw new Error('Encryption key initialization failed');
  }
}

// Шифрование локальных данных с использованием SHA-256 в CTR-режиме
export async function encryptLocalData(plaintext: string): Promise<string> {
  const key = await getOrCreateEncryptionKey();
  const nonceBytes = await Crypto.getRandomBytesAsync(12);
  const nonceHex = Array.from(nonceBytes).map(b => b.toString(16).padStart(2, '0')).join('');

  const plainBytes = new TextEncoder().encode(plaintext);
  const cipherBytes = new Uint8Array(plainBytes.length);

  let counter = 0;
  for (let offset = 0; offset < plainBytes.length; offset += 32) {
    const hashHex = await Crypto.digestStringAsync(SHA256, key + nonceHex + counter.toString(16));
    const hashBytes = hexToBytes(hashHex);
    for (let j = 0; j < 32 && offset + j < plainBytes.length; j++) {
      cipherBytes[offset + j] = plainBytes[offset + j] ^ hashBytes[j];
    }
    counter++;
  }

  const cipherB64 = bytesToBase64(cipherBytes);
  return `ENC:${nonceHex}:${cipherB64}`;
}

export async function decryptLocalData(ciphertext: string): Promise<string> {
  if (!ciphertext.startsWith('ENC:')) return ciphertext;

  const parts = ciphertext.split(':');
  if (parts.length < 3) return ciphertext;

  const nonceHex = parts[1];
  const cipherB64 = parts.slice(2).join(':');
  const key = await getOrCreateEncryptionKey();

  const cipherBytes = base64ToBytes(cipherB64);
  const plainBytes = new Uint8Array(cipherBytes.length);

  let counter = 0;
  for (let offset = 0; offset < cipherBytes.length; offset += 32) {
    const hashHex = await Crypto.digestStringAsync(SHA256, key + nonceHex + counter.toString(16));
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

export { getOrCreateEncryptionKey };