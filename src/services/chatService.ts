import { getDatabase } from '../database/connection';
import { blockUserOnServer, unblockUserOnServer, getBlockedUsersFromServer } from './api';

export interface Chat {
  id: string;
  username: string;
  displayName: string | null;
  avatarUri: string | null;
  lastMessageText: string | null;
  lastMessageTime: number | null;
  lastMessageStatus?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  lastMessageSender?: string;
  unreadCount: number;
  isGhost: boolean;
  autoDeleteTimer: number;
  createdAt: number;
  updatedAt: number;
  isGroup?: boolean;
  isChannel?: boolean;
  groupMemberCount?: number;
  isSavedMessages?: boolean;
}

// Создать или получить чат (исправлено)
export async function createOrGetChat(username: string, isGhost: boolean = false): Promise<Chat> {
  const db = await getDatabase();
  const cleanUsername = username.replace('ghost_', '');
  
  // Ищем существующий не-ghost чат
  const existing = await db.getFirstAsync<any>(
    `SELECT * FROM chats WHERE username = ? AND is_ghost = 0 LIMIT 1`,
    [cleanUsername]
  );

  if (existing) {
    console.log(`Found existing chat: ${existing.id} for ${cleanUsername}`);
    return mapRowToChat(existing);
  }

  // Создаём новый чат
  const id = `chat_${cleanUsername}_${Date.now()}`;
  const now = Date.now();

  await db.runAsync(
    `INSERT INTO chats (id, username, is_ghost, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    [id, cleanUsername, isGhost ? 1 : 0, now, now]
  );

  console.log(`Created new chat: ${id} for ${cleanUsername}`);

  return {
    id,
    username: cleanUsername,
    displayName: null,
    avatarUri: null,
    lastMessageText: null,
    lastMessageTime: null,
    unreadCount: 0,
    isGhost,
    autoDeleteTimer: 0,
    createdAt: now,
    updatedAt: now,
  };
}

// Получить чат по username (исправлено)
export async function getChatByUsername(username: string): Promise<Chat | null> {
  const db = await getDatabase();
  const cleanUsername = username.replace('ghost_', '');
  
  const row = await db.getFirstAsync<any>(
    `SELECT * FROM chats WHERE username = ? LIMIT 1`,
    [cleanUsername]
  );

  if (!row) return null;
  return mapRowToChat(row);
}

// Получить все чаты
export async function getAllChats(): Promise<Chat[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    `SELECT c.*,
            (SELECT status FROM messages WHERE chat_id = c.id AND is_deleted = 0 ORDER BY timestamp DESC LIMIT 1) as last_message_status,
            (SELECT sender_username FROM messages WHERE chat_id = c.id AND is_deleted = 0 ORDER BY timestamp DESC LIMIT 1) as last_message_sender
     FROM chats c WHERE is_ghost = 0 ORDER BY updated_at DESC`
  );
  return rows.map(mapRowToChat);
}

// Обновить последнее сообщение
export async function updateChatLastMessage(chatId: string, text: string, timestamp: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE chats SET last_message_text = ?, last_message_time = ?, updated_at = ? WHERE id = ?`,
    [text, timestamp, Date.now(), chatId]
  );
}

// Удалить чат
export async function deleteChat(chatId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`DELETE FROM messages WHERE chat_id = ?`, [chatId]);
  await db.runAsync(`DELETE FROM drafts WHERE chat_id = ?`, [chatId]);
  await db.runAsync(`DELETE FROM chats WHERE id = ?`, [chatId]);
}

// Установить таймер автоудаления
export async function setAutoDeleteTimer(chatId: string, timer: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE chats SET auto_delete_timer = ?, updated_at = ? WHERE id = ?`,
    [timer, Date.now(), chatId]
  );
}

export async function getChatById(chatId: string): Promise<Chat | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<any>(`SELECT * FROM chats WHERE id = ?`, [chatId]);
  return row ? mapRowToChat(row) : null;
}

// Real block — calls server API + stores locally
export async function blockUser(username: string, myUsername: string): Promise<boolean> {
  try {
    const ok = await blockUserOnServer(myUsername, username);
    if (ok) {
      const db = await getDatabase();
      const cleanUsername = username.replace('ghost_', '');
      await db.runAsync(
        `INSERT OR REPLACE INTO blocked_users (username, blocked_at) VALUES (?, ?)`,
        [cleanUsername, Date.now()]
      );
      // Remove local chat
      await db.runAsync(`DELETE FROM messages WHERE chat_id IN (SELECT id FROM chats WHERE username = ?)`, [cleanUsername]);
      await db.runAsync(`DELETE FROM drafts WHERE chat_id IN (SELECT id FROM chats WHERE username = ?)`, [cleanUsername]);
      await db.runAsync(`DELETE FROM chats WHERE username = ?`, [cleanUsername]);
    }
    return ok;
  } catch {
    return false;
  }
}

export async function unblockUser(username: string, myUsername: string): Promise<boolean> {
  try {
    const ok = await unblockUserOnServer(myUsername, username);
    if (ok) {
      const db = await getDatabase();
      await db.runAsync(`DELETE FROM blocked_users WHERE username = ?`, [username]);
    }
    return ok;
  } catch {
    return false;
  }
}

export async function getBlockedUsers(): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(`SELECT username FROM blocked_users ORDER BY blocked_at DESC`);
  return rows.map(r => r.username);
}

export async function syncBlockedUsersFromServer(myUsername: string): Promise<void> {
  const blocked = await getBlockedUsersFromServer(myUsername);
  if (!blocked) return;
  const db = await getDatabase();
  await db.runAsync(`DELETE FROM blocked_users`);
  for (const username of blocked) {
    await db.runAsync(
      `INSERT OR REPLACE INTO blocked_users (username, blocked_at) VALUES (?, ?)`,
      [username, Date.now()]
    );
  }
}

function mapRowToChat(row: any): Chat {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUri: row.avatar_uri,
    lastMessageText: row.last_message_text,
    lastMessageTime: row.last_message_time,
    lastMessageStatus: row.last_message_status || undefined,
    lastMessageSender: row.last_message_sender || undefined,
    unreadCount: row.unread_count || 0,
    isGhost: row.is_ghost === 1,
    autoDeleteTimer: row.auto_delete_timer || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}