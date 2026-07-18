declare module 'expo-notifications' {
  import { ComponentType } from 'react';

  export interface NotificationContent {
    title: string;
    subtitle?: string;
    body: string;
    data?: Record<string, any>;
    sound?: string;
    badge?: number;
    channelId?: string;
  }

  export interface NotificationRequest {
    identifier: string;
    content: NotificationContent;
    trigger: any;
  }

  export interface Notification {
    request: NotificationRequest;
    date: number;
  }

  export interface NotificationResponse {
    notification: Notification;
    actionIdentifier: string;
    userText?: string;
  }

  export enum AndroidImportance {
    DEFAULT = 3,
    HIGH = 4,
    LOW = 2,
    MIN = 1,
    MAX = 5,
    NONE = 0,
  }

  export interface AndroidNotificationChannel {
    id: string;
    name: string;
    importance: AndroidImportance;
    vibrationPattern?: number[];
    sound?: string;
  }

  export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

  export interface NotificationPermissionsStatus {
    status: PermissionStatus;
    expires: string;
    canRequestAgain: boolean;
    shouldShowRationale: boolean;
    ios?: any;
    android?: any;
  }

  export function getPermissionsAsync(): Promise<NotificationPermissionsStatus>;
  export function requestPermissionsAsync(): Promise<NotificationPermissionsStatus>;
  export function getExpoPushTokenAsync(options?: { projectId?: string }): Promise<{ data: string; type: string }>;
  export function setNotificationChannelAsync(channelId: string, channel: {
    name: string;
    importance: AndroidImportance;
    vibrationPattern?: number[];
    sound?: string;
    lightColor?: string;
  }): Promise<void>;
  export function setNotificationHandler(handler: {
    handleNotification: (notification: Notification) => Promise<{
      shouldShowAlert: boolean;
      shouldPlaySound: boolean;
      shouldSetBadge: boolean;
      shouldShowBanner?: boolean;
      shouldShowList?: boolean;
    }>;
  }): void;
  export function scheduleNotificationAsync(request: {
    content: NotificationContent;
    trigger: any;
  }): Promise<string>;
  export function addNotificationResponseReceivedListener(callback: (response: NotificationResponse) => void): () => void;
  export function addNotificationReceivedListener(callback: (notification: Notification) => void): () => void;
  export function removeNotificationSubscription(subscription: () => void): void;
  export function dismissAllNotificationsAsync(): Promise<void>;
  export function getLastNotificationResponseAsync(): Promise<NotificationResponse | null>;
  export function setBadgeCountAsync(count: number): Promise<void>;
}
