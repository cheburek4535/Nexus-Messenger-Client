import { Message } from './messageService';
import { GroupMessage } from './groupService';
import { ChannelMessage } from './channelService';

interface CacheEntry<T> {
  messages: T[];
  lastSync: number;
}

const dmCache = new Map<string, CacheEntry<Message>>();
const groupCache = new Map<string, CacheEntry<GroupMessage>>();
const channelCache = new Map<string, CacheEntry<ChannelMessage>>();

export function getCachedMessages(chatId: string): Message[] | null {
  const entry = dmCache.get(chatId);
  return entry ? entry.messages : null;
}

export function getCachedGroupMessages(groupId: string): GroupMessage[] | null {
  const entry = groupCache.get(groupId);
  return entry ? entry.messages : null;
}

export function getCachedChannelMessages(channelId: string): ChannelMessage[] | null {
  const entry = channelCache.get(channelId);
  return entry ? entry.messages : null;
}

export function setCachedMessages(chatId: string, messages: Message[]): void {
  dmCache.set(chatId, { messages, lastSync: Date.now() });
}

export function setCachedGroupMessages(groupId: string, messages: GroupMessage[]): void {
  groupCache.set(groupId, { messages, lastSync: Date.now() });
}

export function setCachedChannelMessages(channelId: string, messages: ChannelMessage[]): void {
  channelCache.set(channelId, { messages, lastSync: Date.now() });
}

export function appendMessage(chatId: string, message: Message): void {
  const entry = dmCache.get(chatId);
  if (entry) {
    if (!entry.messages.some(m => m.id === message.id)) {
      entry.messages = [...entry.messages, message];
    }
    entry.lastSync = Date.now();
  }
}

export function appendGroupMessage(groupId: string, message: GroupMessage): void {
  const entry = groupCache.get(groupId);
  if (entry) {
    if (!entry.messages.some(m => m.id === message.id)) {
      entry.messages = [...entry.messages, message];
    }
    entry.lastSync = Date.now();
  }
}

export function appendChannelMessage(channelId: string, message: ChannelMessage): void {
  const entry = channelCache.get(channelId);
  if (entry) {
    if (!entry.messages.some(m => m.id === message.id)) {
      entry.messages = [...entry.messages, message];
    }
    entry.lastSync = Date.now();
  }
}

export function updateMessageInCache(chatId: string, messageId: string, updates: Partial<Message>): void {
  const entry = dmCache.get(chatId);
  if (entry) {
    entry.messages = entry.messages.map(m =>
      m.id === messageId ? { ...m, ...updates } : m
    ) as Message[];
    entry.lastSync = Date.now();
  }
}

export function updateGroupMessageInCache(groupId: string, messageId: string, updates: Partial<GroupMessage>): void {
  const entry = groupCache.get(groupId);
  if (entry) {
    entry.messages = entry.messages.map(m =>
      m.id === messageId ? { ...m, ...updates } : m
    ) as GroupMessage[];
    entry.lastSync = Date.now();
  }
}

export function removeMessageFromCache(chatId: string, messageId: string): void {
  const entry = dmCache.get(chatId);
  if (entry) {
    entry.messages = entry.messages.filter(m => m.id !== messageId);
    entry.lastSync = Date.now();
  }
}

export function removeGroupMessageFromCache(groupId: string, messageId: string): void {
  const entry = groupCache.get(groupId);
  if (entry) {
    entry.messages = entry.messages.filter(m => m.id !== messageId);
    entry.lastSync = Date.now();
  }
}

export function removeChannelMessageFromCache(channelId: string, messageId: string): void {
  const entry = channelCache.get(channelId);
  if (entry) {
    entry.messages = entry.messages.filter(m => m.id !== messageId);
    entry.lastSync = Date.now();
  }
}

export function clearCacheForChat(chatId: string): void {
  dmCache.delete(chatId);
}

export function clearCacheForGroup(groupId: string): void {
  groupCache.delete(groupId);
}

export function clearCacheForChannel(channelId: string): void {
  channelCache.delete(channelId);
}

export function clearAllCaches(): void {
  dmCache.clear();
  groupCache.clear();
  channelCache.clear();
}
