import { getDatabase } from '../database/connection';
import { sendGroupMessageToServer } from './api';

export const REACTIONS = ['👍', '👎', '❤️', '😂', '😮'];

export async function setReaction(
  messageId: string,
  reaction: string,
  username: string,
  chatId?: string,
  groupId?: string
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO message_reactions (message_id, username, reaction, chat_id, group_id, timestamp)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [messageId, username, reaction, chatId || null, groupId || null, Date.now()]
  );
}

export async function removeReaction(messageId: string, username: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `DELETE FROM message_reactions WHERE message_id = ? AND username = ?`,
    [messageId, username]
  );
}

export async function getReactions(messageId: string): Promise<{ username: string; reaction: string }[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    `SELECT username, reaction FROM message_reactions WHERE message_id = ? ORDER BY timestamp ASC`,
    [messageId]
  );
  return rows.map((r: any) => ({ username: r.username, reaction: r.reaction }));
}

export async function getMyReaction(messageId: string, username: string): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<any>(
    `SELECT reaction FROM message_reactions WHERE message_id = ? AND username = ?`,
    [messageId, username]
  );
  return row?.reaction || null;
}

export async function toggleReaction(
  messageId: string,
  reaction: string,
  username: string,
  chatId?: string,
  groupId?: string
): Promise<{ reaction: string | null }> {
  const current = await getMyReaction(messageId, username);
  if (current === reaction) {
    await removeReaction(messageId, username);
    return { reaction: null };
  }
  await setReaction(messageId, reaction, username, chatId, groupId);
  return { reaction };
}

export async function getGroupReactionsForMessages(
  messageIds: string[]
): Promise<Map<string, { username: string; reaction: string }[]>> {
  if (messageIds.length === 0) return new Map();
  const db = await getDatabase();
  const placeholders = messageIds.map(() => '?').join(',');
  const rows = await db.getAllAsync<any>(
    `SELECT message_id, username, reaction FROM message_reactions WHERE message_id IN (${placeholders}) ORDER BY timestamp ASC`,
    messageIds
  );
  const map = new Map<string, { username: string; reaction: string }[]>();
  for (const r of rows) {
    const arr = map.get(r.message_id) || [];
    arr.push({ username: r.username, reaction: r.reaction });
    map.set(r.message_id, arr);
  }
  return map;
}
