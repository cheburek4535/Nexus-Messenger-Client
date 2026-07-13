import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ColorPresetKey } from '../theme/colorPresets';

const SETTINGS_KEY = 'nexus_user_settings';

export type ThemeMode = 'light' | 'dark' | 'system';
export type { ColorPresetKey };
export type FontSize = 'small' | 'medium' | 'large';
export type BubbleStyle = 'default' | 'rounded' | 'compact';
export type BackgroundStyle = 'tech' | 'minimal' | 'gradient' | 'solid';

export interface UserSettings {
  theme: ThemeMode;
  colorPreset: ColorPresetKey;
  accentColor: string | null;
  bubbleStyle: BubbleStyle;
  fontSize: FontSize;
  backgroundStyle: BackgroundStyle;
  notificationsEnabled: boolean;
  notificationSound: boolean;
  notificationVibration: boolean;
  notificationPreview: boolean;
  notificationGroup: boolean;
  typingIndicator: boolean;
  showMessageTime: boolean;
}

const defaultSettings: UserSettings = {
  theme: 'dark',
  colorPreset: 'default',
  accentColor: null,
  bubbleStyle: 'default',
  fontSize: 'medium',
  backgroundStyle: 'tech',
  notificationsEnabled: true,
  notificationSound: true,
  notificationVibration: true,
  notificationPreview: true,
  notificationGroup: true,
  typingIndicator: true,
  showMessageTime: true,
};

let cachedSettings: UserSettings | null = null;
let listeners: Array<() => void> = [];

export async function loadSettings(): Promise<UserSettings> {
  try {
    const json = await AsyncStorage.getItem(SETTINGS_KEY);
    if (json) {
      const parsed = JSON.parse(json);
      cachedSettings = { ...defaultSettings, ...parsed };
    } else {
      cachedSettings = { ...defaultSettings };
    }
  } catch {
    cachedSettings = { ...defaultSettings };
  }
  return cachedSettings!;
}

export async function getSettings(): Promise<UserSettings> {
  if (cachedSettings) return cachedSettings;
  return loadSettings();
}

export async function updateSettings(updates: Partial<UserSettings>): Promise<UserSettings> {
  const current = await getSettings();
  cachedSettings = { ...current, ...updates };
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(cachedSettings));
  listeners.forEach(fn => fn());
  return cachedSettings;
}

export function onSettingsChange(fn: () => void): () => void {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter(f => f !== fn);
  };
}

export function getCachedSettings(): UserSettings {
  return cachedSettings || defaultSettings;
}

export const fontSizeScale: Record<FontSize, number> = {
  small: 0.85,
  medium: 1,
  large: 1.15,
};
