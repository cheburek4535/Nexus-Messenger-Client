import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { t } from './i18n';

export interface PrivacySettings {
  showAvatar: boolean;
  showStatus: boolean;
  showReadReceipts: boolean;
}

export interface LocalIdentity {
  username: string;
  publicKey: string;
  deviceId: string;
  avatarUri: string | null;
  displayName: string;
  status: string;
  createdAt: string;
  privacy: PrivacySettings;
}

const IDENTITY_KEY = 'nexus_identity';
const PRIVATE_KEY_KEY = 'nexus_private_key';
const AUTH_TOKEN_KEY = 'nexus_auth_token';

// Генерация криптостойких случайных байтов
async function generateSecureBytes(length: number): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(length);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Генерация ключей с использованием expo-crypto
async function generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
  const privateKey = await generateSecureBytes(32);
  const publicKey = await generateSecureBytes(32);

  return {
    publicKey: `nexus_pub_${privateKey}`,
    privateKey: `nexus_priv_${privateKey}`,
  };
}

export async function createLocalIdentity(username: string): Promise<LocalIdentity> {
  // 1. Генерируем ключи с expo-crypto
  const { publicKey, privateKey } = await generateKeyPair();

  // 2. Создаём идентификатор устройства
  const deviceBytes = await Crypto.getRandomBytesAsync(8);
  const deviceId = `device_${Array.from(deviceBytes).map(b => b.toString(16).padStart(2, '0')).join('')}`;

  // 3. Формируем профиль
  const identity: LocalIdentity = {
    username: username.toLowerCase().trim(),
    publicKey,
    deviceId,
    avatarUri: null,
    displayName: '',
    status: t('profile.available'),
    createdAt: new Date().toISOString(),
    privacy: {
      showAvatar: true,
      showStatus: true,
      showReadReceipts: true,
    },
  };

  // 4. Сохраняем приватный ключ в защищённое хранилище
  try {
    if (Platform.OS === 'web') {
      localStorage.setItem(PRIVATE_KEY_KEY, privateKey);
    } else {
      await SecureStore.setItemAsync(PRIVATE_KEY_KEY, privateKey);
    }
  } catch (error) {
    console.warn('Failed to save private key to SecureStore:', error);
  }

  // 5. Сохраняем профиль
  try {
    await SecureStore.setItemAsync(IDENTITY_KEY, JSON.stringify(identity));
  } catch (error) {
    console.warn('Failed to save identity to SecureStore:', error);
  }

  return identity;
}

export function validateIdentity(data: any): data is LocalIdentity {
  if (!data || typeof data !== 'object') return false;
  return !!(
    typeof data.username === 'string' && data.username.length > 0 &&
    typeof data.publicKey === 'string' && data.publicKey.length > 0 &&
    typeof data.deviceId === 'string' && data.deviceId.length > 0
  );
}

export async function getLocalIdentity(): Promise<LocalIdentity | null> {
  try {
    const json = await SecureStore.getItemAsync(IDENTITY_KEY);
    if (!json) return null;
    const parsed = JSON.parse(json);
    if (!validateIdentity(parsed)) return null;
    return parsed as LocalIdentity;
  } catch (error) {
    console.error('Failed to get identity:', error);
    return null;
  }
}

export async function getPrivateKey(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      return localStorage.getItem(PRIVATE_KEY_KEY);
    }
    return await SecureStore.getItemAsync(PRIVATE_KEY_KEY);
  } catch (error) {
    console.error('Failed to get private key:', error);
    return null;
  }
}

export async function updateLocalIdentity(updates: Partial<Omit<LocalIdentity, 'username' | 'deviceId' | 'createdAt'>>) {
  const current = await getLocalIdentity();
  if (!current) throw new Error('No identity found');
  const updated = { ...current, ...updates };
  await SecureStore.setItemAsync(IDENTITY_KEY, JSON.stringify(updated));
  return updated;
}

export async function deleteLocalIdentity(): Promise<void> {
  await SecureStore.deleteItemAsync(IDENTITY_KEY);
  await SecureStore.deleteItemAsync(PRIVATE_KEY_KEY);
  await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
  if (Platform.OS === 'web') {
    localStorage.removeItem(IDENTITY_KEY);
    localStorage.removeItem(PRIVATE_KEY_KEY);
    localStorage.removeItem(AUTH_TOKEN_KEY);
  }
}

// ── Auth Token Management ───────────────────────────────────────

export async function saveAuthToken(token: string): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      await SecureStore.setItemAsync(AUTH_TOKEN_KEY, token);
    }
  } catch (error) {
    console.warn('Failed to save auth token:', error);
  }
}

export async function getAuthToken(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      return localStorage.getItem(AUTH_TOKEN_KEY);
    }
    return await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
  } catch (error) {
    console.error('Failed to get auth token:', error);
    return null;
  }
}

export async function clearAuthToken(): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    } else {
      await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
    }
  } catch (error) {
    console.warn('Failed to clear auth token:', error);
  }
}

export async function updatePrivacy(privacy: PrivacySettings): Promise<LocalIdentity> {
  return updateLocalIdentity({ privacy });
}

export async function updateAvatar(imageUri: string): Promise<string | null> {
  try {
    const fs = FileSystem as any;
    const base64 = await fs.readAsStringAsync(imageUri, {
      encoding: 'base64',
    });
    const avatarDataUri = `data:image/jpeg;base64,${base64}`;
    await updateLocalIdentity({ avatarUri: avatarDataUri });
    return avatarDataUri;
  } catch (error) {
    console.error('Failed to update avatar:', error);
    return null;
  }
}

export async function removeAvatar(): Promise<void> {
  await updateLocalIdentity({ avatarUri: null });
}

export async function getProfileDisplayData(): Promise<{
  username: string;
  deviceId: string;
  avatarUri: string | null;
  displayName: string;
  status: string;
  createdAt: string;
  privacy: PrivacySettings;
} | null> {
  const identity = await getLocalIdentity();
  if (!identity) return null;
  return {
    username: identity.username,
    deviceId: identity.deviceId,
    avatarUri: identity.avatarUri,
    displayName: identity.displayName || '',
    status: identity.status || t('profile.available'),
    createdAt: identity.createdAt,
    privacy: identity.privacy || { showAvatar: true, showStatus: true, showReadReceipts: true },
  };
}