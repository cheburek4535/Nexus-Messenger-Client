import { getLocalIdentity, getAuthToken } from './identity';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { t } from './i18n';

const SERVER_URL_KEY = 'nexus_server_url';
const DEFAULT_SERVER_URL = 'YOUR_SERVER_URL'; //here was my server url 

let cachedServerUrls: { http: string; ws: string } | null = null;

// Сохраняем URL сервера
export async function saveServerUrl(url: string): Promise<void> {
  await AsyncStorage.setItem(SERVER_URL_KEY, url);
}

// Получаем сохранённый URL
async function getSavedServerUrl(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(SERVER_URL_KEY);
  } catch {
    return null;
  }
}

// Автоматическое определение URL сервера — удалено, используется DEFAULT_SERVER_URL
export function getCachedServerUrl(): { http: string; ws: string } | null {
  return cachedServerUrls;
}

function httpToWs(httpUrl: string): string {
  return httpUrl.replace(/^http/, 'ws');
}

async function getServerUrl(): Promise<{ http: string; ws: string }> {
  if (cachedServerUrls) {
    return cachedServerUrls;
  }

  const savedUrl = await getSavedServerUrl();
  let url = DEFAULT_SERVER_URL;

  if (savedUrl) {
    const isLocal = savedUrl.includes('localhost') || savedUrl.includes('10.0.2.2') || savedUrl.includes('192.168') || savedUrl.includes('127.0.0.1');
    if (isLocal) {
      await AsyncStorage.removeItem(SERVER_URL_KEY);
    } else {
      url = savedUrl;
    }
  }

  cachedServerUrls = { http: url, ws: httpToWs(url) };
  return cachedServerUrls;
}

// Получение профиля пользователя
export async function getUserProfile(username: string, requester?: string): Promise<{
  username: string;
  public_key: string;
  device_id: string;
  avatar_uri?: string;
  display_name?: string;
  show_avatar: boolean;
  show_status: boolean;
  show_read_receipts: boolean;
  last_seen: number;
  is_blocked: boolean;
  error?: string;
}> {
  try {
    const urls = await getServerUrl();
    let url = `${urls.http}/api/profile?username=${encodeURIComponent(username)}`;
    if (requester) {
      url += `&requester=${encodeURIComponent(requester)}`;
    }
    const response = await fetchWithTimeout(url, { method: 'GET' });
    return await response.json();
  } catch (error) {
    console.error('GetProfile failed:', error);
    return { username, public_key: '', device_id: '', last_seen: 0, show_avatar: true, show_status: true, show_read_receipts: true, is_blocked: false, error: String(error) };
  }
}

// Обновление профиля на сервере (avatar, displayName — privacy goes through PUT /api/privacy)
export async function updateProfileOnServer(data: {
  username: string;
  avatar_uri?: string;
  display_name?: string;
}): Promise<boolean> {
  try {
    const urls = await getServerUrl();
    const response = await fetchWithTimeout(`${urls.http}/api/update-profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return response.ok;
  } catch (error) {
    console.error('UpdateProfile failed:', error);
    return false;
  }
}

// Получение заголовков авторизации
async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  const token = await getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// Fetch с таймаутом + авторизация + повторные попытки
async function fetchWithTimeout(url: string, options: RequestInit, timeout = 15000, retries = 3) {
  const authHeaders = await getAuthHeaders();
  const mergedHeaders = {
    ...options.headers,
    ...authHeaders,
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers: mergedHeaders,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 401) {
        const { clearAuthToken } = await import('./identity');
        await clearAuthToken();
        return response;
      }

      if (response.ok || (response.status >= 400 && response.status < 500 && response.status !== 429)) {
        return response;
      }

      if (attempt < retries) {
        await delay(1000 * Math.pow(2, attempt));
        continue;
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error as Error;

      if ((error as Error)?.name === 'AbortError') {
        throw error;
      }

      if (attempt < retries) {
        await delay(1000 * Math.pow(2, attempt));
      }
    }
  }

  throw lastError || new Error('Request failed after retries');
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function checkServerHealth(url: string): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(`${url}/health`, { method: 'GET' }, 10000, 0);
    return response.ok;
  } catch {
    return false;
  }
}

// Регистрация на сервере
export async function registerOnServer(): Promise<{ success: boolean; error?: string }> {
  try {
    const identity = await getLocalIdentity();
    if (!identity) {
      return { success: false, error: 'No local identity found' };
    }

    const urls = await getServerUrl();
    const url = `${urls.http}/api/register`;
    
    console.log(`🌐 Registering on: ${url}`);
    
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: identity.username,
        public_key: identity.publicKey,
        device_id: identity.deviceId,
        avatar_uri: identity.avatarUri || '',
        display_name: identity.displayName || '',
        show_avatar: identity.privacy?.showAvatar ?? true,
        show_status: identity.privacy?.showStatus ?? true,
        show_read_receipts: identity.privacy?.showReadReceipts ?? true,
      }),
    });

    const data = await response.json();
    
    console.log('📋 Register response:', JSON.stringify(data));
    
    // Сохраняем auth token из ответа
    if (data.success && data.auth_token) {
      const { saveAuthToken } = await import('./identity');
      await saveAuthToken(data.auth_token);
      console.log('🔑 Auth token saved');
    }
    
    return data;
  } catch (error) {
    console.error('Registration failed:', error);
    return { success: false, error: 'Cannot connect to server' };
  }
}

// Поиск пользователя
export async function searchUser(username: string): Promise<{ 
  found: boolean; 
  username?: string; 
  publicKey?: string;
  avatar_uri?: string;
  display_name?: string;
  error?: string;
}> {
  try {
    const cleanUsername = username.startsWith('@') ? username.substring(1) : username;
    const urls = await getServerUrl();
    
    const response = await fetchWithTimeout(
      `${urls.http}/api/search?username=${encodeURIComponent(cleanUsername)}`,
      { method: 'GET' }
    );

    return await response.json();
  } catch (error) {
    console.error('Search failed:', error);
    return { found: false, error: t('search.checkConnection') };
  }
}

// Отправка сообщения
export async function sendMessageToServer(
  fromUser: string,
  toUser: string,
  ciphertext: string,
  extra?: {
    contentType?: string;
    contentUri?: string;
    mediaMimeType?: string;
    replyToId?: string | null;
    replyToText?: string | null;
    replyToUsername?: string | null;
    nonce?: string;
    forwardedFrom?: string;
  }
): Promise<{ message_id?: string; status?: string; timestamp?: number; error?: string }> {
  try {
    const urls = await getServerUrl();
    console.log(`📤 Sending encrypted message from ${fromUser} to ${toUser}`);
    
    const body: any = {
      from_user: fromUser,
      to_user: toUser,
      ciphertext,
      nonce: extra?.nonce || '',
    };
    if (extra?.contentType) body.content_type = extra.contentType;
    if (extra?.contentUri) body.content_uri = extra.contentUri;
    if (extra?.mediaMimeType) body.media_mime_type = extra.mediaMimeType;
    if (extra?.replyToId) body.reply_to_id = extra.replyToId;
    if (extra?.replyToText) body.reply_to_text = extra.replyToText;
    if (extra?.replyToUsername) body.reply_to_username = extra.replyToUsername;
    if (extra?.forwardedFrom) body.forwarded_from = extra.forwardedFrom;

    const response = await fetchWithTimeout(`${urls.http}/api/send`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    console.log('✅ Send response:', data);
    
    return data;
  } catch (error) {
    console.error('❌ Send failed:', error);
    return { error: String(error) };
  }
}

export async function blockUserOnServer(username: string, blockedUser: string): Promise<boolean> {
  try {
    const urls = await getServerUrl();
    const response = await fetchWithTimeout(`${urls.http}/api/block`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, blocked_user: blockedUser }),
    });
    return response.ok;
  } catch (error) {
    console.error('Block failed:', error);
    return false;
  }
}

export async function unblockUserOnServer(username: string, blockedUser: string): Promise<boolean> {
  try {
    const urls = await getServerUrl();
    const response = await fetchWithTimeout(`${urls.http}/api/unblock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, blocked_user: blockedUser }),
    });
    return response.ok;
  } catch (error) {
    console.error('Unblock failed:', error);
    return false;
  }
}

export async function getBlockedUsersFromServer(username: string): Promise<string[]> {
  try {
    const urls = await getServerUrl();
    const response = await fetchWithTimeout(
      `${urls.http}/api/blocked-users?username=${encodeURIComponent(username)}`,
      { method: 'GET' }
    );
    const data = await response.json();
    return data.blocked_users || [];
  } catch (error) {
    console.error('GetBlockedUsers failed:', error);
    return [];
  }
}

export async function updatePrivacyOnServer(data: {
  username: string;
  show_avatar: boolean;
  show_status: boolean;
  show_read_receipts: boolean;
}): Promise<boolean> {
  try {
    const urls = await getServerUrl();
    const response = await fetchWithTimeout(`${urls.http}/api/privacy`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return response.ok;
  } catch (error) {
    console.error('UpdatePrivacy failed:', error);
    return false;
  }
}

export async function updatePushTokenOnServer(username: string, pushToken: string): Promise<boolean> {
  try {
    const urls = await getServerUrl();
    const response = await fetchWithTimeout(`${urls.http}/api/push-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, push_token: pushToken }),
    });
    return response.ok;
  } catch (error) {
    console.error('UpdatePushToken failed:', error);
    return false;
  }
}

// ─── Groups API ────────────────────────────────────────────────

export async function createGroupOnServer(data: {
  name: string;
  description?: string;
  avatar_uri?: string;
  created_by: string;
  members: string[];
  is_channel?: boolean;
}): Promise<{ success: boolean; group_id?: string; error?: string }> {
  try {
    const urls = await getServerUrl();
    const response = await fetchWithTimeout(`${urls.http}/api/groups/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return await response.json();
  } catch (error) {
    console.error('CreateGroup failed:', error);
    return { success: false, error: String(error) };
  }
}

export async function getUserGroupsFromServer(username: string): Promise<any[]> {
  try {
    const urls = await getServerUrl();
    const response = await fetchWithTimeout(
      `${urls.http}/api/groups?username=${encodeURIComponent(username)}`,
      { method: 'GET' }
    );
    const data = await response.json();
    return data.groups || [];
  } catch (error) {
    console.error('GetUserGroups failed:', error);
    return [];
  }
}

export async function getGroupFromServer(groupId: string): Promise<any> {
  try {
    const urls = await getServerUrl();
    const response = await fetchWithTimeout(
      `${urls.http}/api/group?group_id=${encodeURIComponent(groupId)}`,
      { method: 'GET' }
    );
    return await response.json();
  } catch (error) {
    console.error('GetGroup failed:', error);
    return null;
  }
}

export async function updateGroupOnServer(data: {
  group_id: string;
  name?: string;
  description?: string;
  avatar_uri?: string;
  created_by?: string;
}): Promise<boolean> {
  try {
    const urls = await getServerUrl();
    const response = await fetchWithTimeout(`${urls.http}/api/group/update`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return response.ok;
  } catch (error) {
    console.error('UpdateGroup failed:', error);
    return false;
  }
}

export async function addGroupMemberOnServer(groupId: string, username: string, addedBy: string): Promise<boolean> {
  try {
    const urls = await getServerUrl();
    const response = await fetchWithTimeout(`${urls.http}/api/group/add-member`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group_id: groupId, username, added_by: addedBy }),
    });
    return response.ok;
  } catch (error) {
    console.error('AddGroupMember failed:', error);
    return false;
  }
}

export async function removeGroupMemberOnServer(groupId: string, username: string): Promise<boolean> {
  try {
    const urls = await getServerUrl();
    const response = await fetchWithTimeout(`${urls.http}/api/group/remove-member`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group_id: groupId, username }),
    });
    return response.ok;
  } catch (error) {
    console.error('RemoveGroupMember failed:', error);
    return false;
  }
}

export async function deleteGroupOnServer(groupId: string, username: string): Promise<boolean> {
  try {
    const urls = await getServerUrl();
    const response = await fetchWithTimeout(`${urls.http}/api/group/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group_id: groupId, username }),
    });
    return response.ok;
  } catch (error) {
    console.error('DeleteGroup failed:', error);
    return false;
  }
}

export async function deleteChannelOnServer(channelId: string, username: string): Promise<boolean> {
  try {
    const urls = await getServerUrl();
    const response = await fetchWithTimeout(`${urls.http}/api/channel/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel_id: channelId, username }),
    });
    return response.ok;
  } catch (error) {
    console.error('DeleteChannel failed:', error);
    return false;
  }
}

export async function leaveChannelOnServer(channelId: string, username: string): Promise<boolean> {
  try {
    const urls = await getServerUrl();
    const response = await fetchWithTimeout(`${urls.http}/api/channel/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel_id: channelId, username }),
    });
    return response.ok;
  } catch (error) {
    console.error('LeaveChannel failed:', error);
    return false;
  }
}

export async function setGroupAdminOnServer(data: {
  group_id: string;
  username: string;
  is_admin: boolean;
  owner: string;
}): Promise<boolean> {
  try {
    const urls = await getServerUrl();
    const response = await fetchWithTimeout(`${urls.http}/api/group/set-admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return response.ok;
  } catch (error) {
    console.error('SetGroupAdmin failed:', error);
    return false;
  }
}

export async function sendGroupMessageToServer(data: {
  group_id: string;
  sender_username: string;
  content_type?: string;
  content_text?: string;
  content_uri?: string;
  reply_to_id?: string;
  reply_to_text?: string;
  reply_to_username?: string;
  forwarded_from?: string;
}): Promise<{ status?: string; message_id?: string; timestamp?: string; error?: string }> {
  try {
    const urls = await getServerUrl();
    const response = await fetchWithTimeout(`${urls.http}/api/group/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        group_id: data.group_id,
        sender_username: data.sender_username,
        content_type: data.content_type,
        content_text: data.content_text,
        content_uri: data.content_uri,
        reply_to_id: data.reply_to_id,
        reply_to_text: data.reply_to_text,
        reply_to_username: data.reply_to_username,
        forwarded_from: data.forwarded_from,
      }),
    });
    return await response.json();
  } catch (error) {
    console.error('SendGroupMessage failed:', error);
    return { error: String(error) };
  }
}

export async function getGroupMessagesFromServer(groupId: string, limit?: number): Promise<any[]> {
  try {
    const urls = await getServerUrl();
    let url = `${urls.http}/api/group/messages?group_id=${encodeURIComponent(groupId)}`;
    if (limit !== undefined) url += `&limit=${limit}`;
    const response = await fetchWithTimeout(url, { method: 'GET' });
    const data = await response.json();
    return data.messages || [];
  } catch (error) {
    console.error('GetGroupMessages failed:', error);
    return [];
  }
}

export async function createChannelOnServer(data: {
  name: string;
  description?: string;
  avatar_uri?: string;
  created_by: string;
  members: string[];
}): Promise<{ success: boolean; channel_id?: string; error?: string }> {
  try {
    const urls = await getServerUrl();
    const response = await fetchWithTimeout(`${urls.http}/api/channels/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return await response.json();
  } catch (error) {
    console.error('CreateChannel failed:', error);
    return { success: false, error: String(error) };
  }
}

export async function getUserChannelsFromServer(username: string): Promise<any[]> {
  try {
    const urls = await getServerUrl();
    const response = await fetchWithTimeout(
      `${urls.http}/api/channels?username=${encodeURIComponent(username)}`,
      { method: 'GET' }
    );
    const data = await response.json();
    return data.channels || [];
  } catch (error) {
    console.error('GetUserChannels failed:', error);
    return [];
  }
}

export async function getChannelFromServer(channelId: string): Promise<any> {
  try {
    const urls = await getServerUrl();
    const response = await fetchWithTimeout(
      `${urls.http}/api/channel?channel_id=${encodeURIComponent(channelId)}`,
      { method: 'GET' }
    );
    return await response.json();
  } catch (error) {
    console.error('GetChannel failed:', error);
    return null;
  }
}

export async function updateChannelOnServer(data: {
  channel_id: string;
  name?: string;
  description?: string;
  avatar_uri?: string;
  created_by?: string;
}): Promise<boolean> {
  try {
    const urls = await getServerUrl();
    const response = await fetchWithTimeout(`${urls.http}/api/channel/update`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return response.ok;
  } catch (error) {
    console.error('UpdateChannel failed:', error);
    return false;
  }
}

export async function removeChannelMemberOnServer(channelId: string, username: string): Promise<boolean> {
  try {
    const urls = await getServerUrl();
    const response = await fetchWithTimeout(`${urls.http}/api/channel/remove-member`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel_id: channelId, username }),
    });
    return response.ok;
  } catch (error) {
    console.error('RemoveChannelMember failed:', error);
    return false;
  }
}

export async function addChannelMemberOnServer(channelId: string, username: string, addedBy: string): Promise<boolean> {
  try {
    const urls = await getServerUrl();
    const response = await fetchWithTimeout(`${urls.http}/api/channel/add-member`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel_id: channelId, username, added_by: addedBy }),
    });
    return response.ok;
  } catch (error) {
    console.error('AddChannelMember failed:', error);
    return false;
  }
}

export async function sendChannelMessageToServer(data: {
  channel_id: string;
  sender_username: string;
  content_type?: string;
  content_text?: string;
  content_uri?: string;
  media_mime_type?: string;
  reply_to_id?: string;
  reply_to_text?: string;
  reply_to_username?: string;
  forwarded_from?: string;
}): Promise<{ message_id?: string; status?: string; timestamp?: string; error?: string }> {
  try {
    const urls = await getServerUrl();
    const response = await fetchWithTimeout(`${urls.http}/api/channel/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel_id: data.channel_id,
        sender_username: data.sender_username,
        content_type: data.content_type,
        content_text: data.content_text,
        content_uri: data.content_uri,
        media_mime_type: data.media_mime_type,
        reply_to_id: data.reply_to_id,
        reply_to_text: data.reply_to_text,
        reply_to_username: data.reply_to_username,
        forwarded_from: data.forwarded_from,
      }),
    });
    return await response.json();
  } catch (error) {
    console.error('SendChannelMessage failed:', error);
    return { error: String(error) };
  }
}

export async function getChannelMessagesFromServer(channelId: string, limit?: number): Promise<any[]> {
  try {
    const urls = await getServerUrl();
    let url = `${urls.http}/api/channel/messages?channel_id=${encodeURIComponent(channelId)}`;
    if (limit !== undefined) url += `&limit=${limit}`;
    const response = await fetchWithTimeout(url, { method: 'GET' });
    const data = await response.json();
    return data.messages || [];
  } catch (error) {
    console.error('GetChannelMessages failed:', error);
    return [];
  }
}

export async function searchUsersFromServer(query: string): Promise<any[]> {
  try {
    const urls = await getServerUrl();
    const response = await fetchWithTimeout(
      `${urls.http}/api/search-users?q=${encodeURIComponent(query)}`,
      { method: 'GET' }
    );
    const data = await response.json();
    return data.users || [];
  } catch (error) {
    console.error('SearchUsers failed:', error);
    return [];
  }
}

export { getServerUrl };