import * as Notifications from 'expo-notifications';
import { Platform, AppState } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { getSettings } from './settingsService';
import { getLocalIdentity } from './identity';
import { updatePushTokenOnServer } from './api';
import type { NotificationResponse } from 'expo-notifications';

interface NotificationAction {
  identifier: string;
  buttonTitle: string;
  textInput?: { submitButtonTitle: string; placeholder: string };
  options?: { isDestructive?: boolean; isAuthenticationRequired?: boolean; opensAppToForeground?: boolean };
}

let responseListener: (() => void) | null = null;
let callActionCallback: ((action: string, data: any) => void) | null = null;

const CALL_CATEGORY_ID = 'incoming_call';
const ACTION_ACCEPT = 'ACCEPT';
const ACTION_DECLINE = 'DECLINE';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function initializeNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;

  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Messages',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 100, 100, 100],
        sound: 'default',
      });
      await Notifications.setNotificationChannelAsync('groups', {
        name: 'Group Messages',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 50, 50, 50],
        sound: 'default',
      });
      await Notifications.setNotificationChannelAsync('calls', {
        name: 'Calls',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        sound: 'default',
      });
      console.log('✅ Android notification channels created');
    } catch (e) {
      console.error('Failed to create notification channels:', e);
    }
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    console.log('📋 Existing notification permission:', existingStatus);
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
      console.log('📋 Requested notification permission:', status);
    }
    if (finalStatus !== 'granted') {
      console.warn('⚠️ Notification permission not granted');
      return;
    }
    console.log('✅ Notification permissions granted');
  } catch (e) {
    console.error('Failed to get notification permissions:', e);
  }

  try {
    const acceptAction: NotificationAction = {
      identifier: ACTION_ACCEPT,
      buttonTitle: 'Accept',
      options: {
        opensAppToForeground: true,
      },
    };
    const declineAction: NotificationAction = {
      identifier: ACTION_DECLINE,
      buttonTitle: 'Decline',
      options: {
        opensAppToForeground: true,
      },
    };
    // setNotificationCategoryAsync may not be available on all SDK versions
    try {
      await (Notifications as any).setNotificationCategoryAsync(CALL_CATEGORY_ID, [acceptAction, declineAction]);
    } catch (e) {
      console.warn('Notification categories not supported:', e);
    }
    console.log('✅ Call notification category created');
  } catch (e) {
    console.error('Failed to create call notification category:', e);
  }
}

export function onCallAction(cb: (action: string, data: any) => void) {
  callActionCallback = cb;
  return () => {
    callActionCallback = null;
  };
}

export function showIncomingCallNotification(callerUsername: string, callId: string) {
  if (Platform.OS === 'web') return;

  Notifications.scheduleNotificationAsync({
    content: {
      title: 'Incoming Call',
      body: `@${callerUsername} is calling...`,
      data: {
        type: 'call_initiate',
        target: callerUsername,
        callId: callId,
      },
      sound: 'default',
      ...(Platform.OS === 'android' ? { channelId: 'calls' } : {}),
    },
    trigger: null,
  }).catch((e) => {
    console.error('Failed to show incoming call notification:', e);
  });
}

export async function registerPushToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  const settings = await getSettings();
  if (!settings.notificationsEnabled) {
    console.log('Notifications disabled in settings');
    return null;
  }

  try {
    const identity = await getLocalIdentity();
    if (!identity) {
      console.log('No identity found, skipping push token registration');
      return null;
    }

    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      console.warn('⚠️ No notification permission, cannot register push token');
      return null;
    }

    console.log('📱 Getting Expo push token...');
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    if (!token) {
      console.warn('⚠️ Got empty push token');
      return null;
    }
    console.log('✅ Got Expo push token:', token.substring(0, 20) + '...');

    const success = await updatePushTokenOnServer(identity.username, token);
    if (success) {
      console.log('✅ Push token registered on server');
    } else {
      console.warn('⚠️ Failed to register push token on server');
    }
    return token;
  } catch (e) {
    console.error('❌ Push token registration failed:', e);
    return null;
  }
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
  }).catch((e) => {
    console.error('Failed to show local notification:', e);
  });
}

export function setupNotificationResponseHandler(): void {
  if (Platform.OS === 'web') return;

  responseListener?.();
  responseListener = Notifications.addNotificationResponseReceivedListener(
    (response: NotificationResponse) => {
      const data = response.notification.request.content.data;
      if (!data) return;

      const actionId = response.actionIdentifier;
      const { type, target, callId } = data as { type?: string; target?: string; callId?: string };

      console.log('📲 Notification response:', actionId, type, target);

      if (type === 'call_initiate') {
        if (callActionCallback) {
          if (actionId === ACTION_ACCEPT || actionId === 'expo.modules.notifications.actions.DEFAULT') {
            callActionCallback('accept', { fromUser: target, callId });
          } else if (actionId === ACTION_DECLINE) {
            callActionCallback('decline', { fromUser: target, callId });
          }
        }
        return;
      }

      if (!type || !target) return;

      if (type === 'dm') {
        router.push(`/chat/${target}` as any);
      } else if (type === 'group') {
        router.push(`/group/${target}` as any);
      } else if (type === 'channel') {
        router.push(`/channel/${target}` as any);
      }
    }
  );
}

export async function handleColdStartNotification(): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    const response = await Notifications.getLastNotificationResponseAsync();
    if (!response) return;

    const data = response.notification.request.content.data;
    if (!data) return;

    const actionId = response.actionIdentifier;
    const { type, target, callId } = data as { type?: string; target?: string; callId?: string };

    console.log('📲 Cold-start notification:', actionId, type, target);

    if (type === 'call_initiate') {
      if (callActionCallback) {
        if (actionId === ACTION_ACCEPT || actionId === 'expo.modules.notifications.actions.DEFAULT') {
          callActionCallback('accept', { fromUser: target, callId });
        } else if (actionId === ACTION_DECLINE) {
          callActionCallback('decline', { fromUser: target, callId });
        }
      }
      return;
    }

    if (!type || !target) return;

    if (type === 'dm') {
      router.push(`/chat/${target}` as any);
    } else if (type === 'group') {
      router.push(`/group/${target}` as any);
    } else if (type === 'channel') {
      router.push(`/channel/${target}` as any);
    }
  } catch (e) {
    console.error('Failed to handle cold-start notification:', e);
  }
}

export function cleanupNotificationListeners(): void {
  responseListener?.();
  responseListener = null;
}
