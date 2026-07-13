import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { getSettings } from './settingsService';
import { getLocalIdentity } from './identity';
import { updatePushTokenOnServer } from './api';
import type { NotificationResponse } from 'expo-notifications';

let notificationListener: (() => void) | null = null;
let responseListener: (() => void) | null = null;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function initializeNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Messages',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 100, 100, 100],
      sound: 'default',
    });
    await Notifications.setNotificationChannelAsync('groups', {
      name: 'Group Messages',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 50, 50, 50],
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return;
}

export async function registerPushToken(): Promise<void> {
  if (Platform.OS === 'web') return;

  const settings = await getSettings();
  if (!settings.notificationsEnabled) return;

  try {
    const identity = await getLocalIdentity();
    if (!identity) return;

    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    const { data: token } = await Notifications.getExpoPushTokenAsync({
      projectId: undefined,
    });
    if (!token) return;

    updatePushTokenOnServer(identity.username, token).catch(() => {});
  } catch {}
}

export function showLocalNotification(notification: {
  title: string;
  body: string;
  data?: Record<string, any>;
}): void {
  if (Platform.OS === 'web') return;

  Notifications.scheduleNotificationAsync({
    content: {
      title: notification.title,
      body: notification.body,
      data: notification.data || {},
      sound: 'default',
      ...(Platform.OS === 'android' ? { channelId: 'default' } : {}),
    },
    trigger: null,
  }).catch(() => {});
}

export function setupNotificationResponseHandler(): void {
  if (Platform.OS === 'web') return;

  responseListener?.();
  responseListener = Notifications.addNotificationResponseReceivedListener((response: NotificationResponse) => {
    const data = response.notification.request.content.data;
    if (!data) return;

    const { type, target } = data as { type?: string; target?: string };
    if (!type || !target) return;

    if (type === 'dm') {
      router.push(`/chat/${target}` as any);
    } else if (type === 'group') {
      router.push(`/group/${target}` as any);
    } else if (type === 'channel') {
      router.push(`/channel/${target}` as any);
    }
  });
}

export function cleanupNotificationListeners(): void {
  notificationListener?.();
  notificationListener = null;
  responseListener?.();
  responseListener = null;
}
