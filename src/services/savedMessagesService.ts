import { getDatabase } from '../database/connection';

export interface SavedMessage {
  id: string;
  senderUsername: string;
  contentType: 'text' | 'image' | 'file' | 'video' | 'voice';
  contentText: string | null;
  contentUri: string | null;
  mediaMimeType: string | null;
  timestamp: number;
  replyToId: string | null;
  replyToText: string | null;
  replyToUsername: string | null;
  forwardedFrom: string | null;
  isDeleted: boolean;
}

export const SAVED_CHAT_ID = '__saved__';

export async function sendSavedMessage(opts: {
  senderUsername: string;
  contentText?: string;
  contentType?: 'text' | 'image' | 'file' | 'video' | 'voice';
  contentUri?: string | null;
  mediaMimeType?: string | null;
  replyToId?: string | null;
  replyToText?: string | null;
  replyToUsername?: string | null;
  forwardedFrom?: string;
}): Promise<SavedMessage> {
  const {
    senderUsername, contentText = null,
    contentType = 'text', contentUri = null,
    mediaMimeType = null, replyToId = null, replyToText = null,
    replyToUsername = null, forwardedFrom = null,
  } = opts;

  const db = await getDatabase();
  const id = `svmsg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const timestamp = Date.now();

  await db.runAsync(
    `INSERT INTO saved_messages (id, sender_username, content_type, content_text, content_uri, media_mime_type, timestamp, reply_to_id, reply_to_text, reply_to_username, forwarded_from)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, senderUsername, contentType, contentText, contentUri, mediaMimeType, timestamp, replyToId, replyToText, replyToUsername, forwardedFrom]
  );

  return {
    id, senderUsername, contentType, contentText,
    contentUri, mediaMimeType, timestamp,
    replyToId, replyToText, replyToUsername, forwardedFrom,
    isDeleted: false,
  };
}

export async function getSavedMessages(limit: number = 50): Promise<SavedMessage[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM saved_messages WHERE is_deleted = 0 ORDER BY timestamp ASC, id ASC LIMIT ?`,
    [limit]
  );
  return rows.map(mapRowToSavedMessage);
}

export async function deleteSavedMessage(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`UPDATE saved_messages SET is_deleted = 1 WHERE id = ?`, [id]);
}

export async function deleteAllSavedMessages(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`UPDATE saved_messages SET is_deleted = 1 WHERE is_deleted = 0`);
}

export async function getSavedMessageCount(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM saved_messages WHERE is_deleted = 0`
  );
  return row?.count || 0;
}

export async function getLastSavedMessage(): Promise<SavedMessage | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<any>(
    `SELECT * FROM saved_messages WHERE is_deleted = 0 ORDER BY timestamp DESC LIMIT 1`
  );
  return row ? mapRowToSavedMessage(row) : null;
}

function mapRowToSavedMessage(row: any): SavedMessage {
  return {
    id: row.id,
    senderUsername: row.sender_username,
    contentType: row.content_type,
    contentText: row.content_text,
    contentUri: row.content_uri,
    mediaMimeType: row.media_mime_type,
    timestamp: row.timestamp,
    replyToId: row.reply_to_id,
    replyToText: row.reply_to_text,
    replyToUsername: row.reply_to_username,
    forwardedFrom: row.forwarded_from || null,
    isDeleted: row.is_deleted === 1,
  };
}
