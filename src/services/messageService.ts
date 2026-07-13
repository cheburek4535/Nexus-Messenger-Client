import { getDatabase } from '../database/connection';

export interface Message {
  id: string;
  chatId: string;
  senderUsername: string;
  contentType: 'text' | 'image' | 'file' | 'video' | 'voice';
  contentText: string | null;
  contentUri: string | null;
  mediaMimeType: string | null;
  isEncrypted: boolean;
  timestamp: number;
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  replyToId: string | null;
  replyToText: string | null;
  replyToUsername: string | null;
  forwardedFrom?: string | null;
  isDeleted: boolean;
  deleteAt: number | null;
}

export interface SendMessageOptions {
  chatId: string;
  senderUsername: string;
  contentText?: string;
  contentType?: 'text' | 'image' | 'file' | 'video' | 'voice';
  contentUri?: string | null;
  mediaMimeType?: string | null;
  replyToId?: string | null;
  replyToText?: string | null;
  replyToUsername?: string | null;
  forwardedFrom?: string;
}

export async function sendMessage(opts: SendMessageOptions): Promise<Message> {
  const {
    chatId, senderUsername, contentText = null,
    contentType = 'text', contentUri = null,
    mediaMimeType = null, replyToId = null, replyToText = null, replyToUsername = null, forwardedFrom = null,
  } = opts;

  const db = await getDatabase();
  const id = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const timestamp = Date.now();

  const chat = await db.getFirstAsync<any>(`SELECT id FROM chats WHERE id = ?`, [chatId]);
  if (!chat) {
    throw new Error(`Chat ${chatId} not found`);
  }

  const displayText = replyToText
    ? `↪ ${replyToText.substring(0, 30)}: ${contentText ?? ''}`
    : (contentText ?? `[${contentType}]`);

  await db.runAsync(
    `INSERT INTO messages (id, chat_id, sender_username, content_type, content_text, content_uri, media_mime_type, is_encrypted, timestamp, status, reply_to_id, reply_to_text, reply_to_username, forwarded_from)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, chatId, senderUsername, contentType, contentText, contentUri, mediaMimeType, 1, timestamp, 'sending', replyToId, replyToText, replyToUsername, forwardedFrom]
  );

  await db.runAsync(
    `UPDATE chats SET last_message_text = ?, last_message_time = ?, updated_at = ? WHERE id = ?`,
    [displayText, timestamp, Date.now(), chatId]
  );

  return {
    id, chatId, senderUsername, contentType, contentText,
    contentUri, mediaMimeType, isEncrypted: true, timestamp,
    status: 'sending', replyToId, replyToText, replyToUsername, forwardedFrom,
    isDeleted: false, deleteAt: null,
  };
}

export async function saveIncomingMessage(
  chatId: string,
  senderUsername: string,
  contentText: string,
  {
    messageId, timestamp, contentType, contentUri, mediaMimeType,
    replyToId, replyToText, replyToUsername, forwardedFrom,
  }: {
    messageId?: string;
    timestamp?: number;
    contentType?: 'text' | 'image' | 'file' | 'video' | 'voice';
    contentUri?: string | null;
    mediaMimeType?: string | null;
    replyToId?: string | null;
    replyToText?: string | null;
    replyToUsername?: string | null;
    forwardedFrom?: string;
  } = {}
): Promise<Message> {
  const db = await getDatabase();
  const id = messageId || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const ts = timestamp || Date.now();
  const ct = contentType || 'text';

  const chat = await db.getFirstAsync<any>(`SELECT id FROM chats WHERE id = ?`, [chatId]);
  if (!chat) {
    throw new Error(`Chat ${chatId} not found`);
  }

  const existing = await db.getFirstAsync<any>(`SELECT id FROM messages WHERE id = ?`, [id]);

  if (existing) {
    await db.runAsync(`UPDATE messages SET status = 'delivered' WHERE id = ? AND status NOT IN ('read', 'delivered', 'failed')`, [id]);
  } else {
    await db.runAsync(
      `INSERT INTO messages (id, chat_id, sender_username, content_type, content_text, content_uri, media_mime_type, is_encrypted, timestamp, status, reply_to_id, reply_to_text, reply_to_username, forwarded_from)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, chatId, senderUsername, ct, contentText, contentUri ?? null, mediaMimeType ?? null, 1, ts, 'delivered', replyToId ?? null, replyToText ?? null, replyToUsername ?? null, forwardedFrom ?? null]
    );
  }

  const displayText = replyToText
    ? `↪ ${replyToText.substring(0, 30)}: ${contentText ?? ''}`
    : (contentText ?? `[${ct}]`);

  await db.runAsync(
    `UPDATE chats SET last_message_text = ?, last_message_time = ?, updated_at = ? WHERE id = ?`,
    [displayText, ts, Date.now(), chatId]
  );

  return {
    id, chatId, senderUsername, contentType: ct, contentText,
    contentUri: contentUri ?? null, mediaMimeType: mediaMimeType ?? null,
    isEncrypted: true, timestamp: ts, status: 'delivered',
    replyToId: replyToId ?? null, replyToText: replyToText ?? null,
    replyToUsername: replyToUsername ?? null,
    forwardedFrom: forwardedFrom ?? null,
    isDeleted: false, deleteAt: null,
  };
}

export async function getMessages(chatId: string, limit: number = 50): Promise<Message[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM messages WHERE chat_id = ? AND is_deleted = 0 ORDER BY timestamp ASC, id ASC LIMIT ?`,
    [chatId, limit]
  );
  return rows.map(mapRowToMessage);
}

export async function updateMessageStatus(messageId: string, status: 'sent' | 'delivered' | 'read' | 'failed'): Promise<void> {
  const db = await getDatabase();
  const whereClause = status === 'read' || status === 'failed'
    ? ''
    : status === 'delivered'
      ? `AND status IN ('sending', 'sent')`
      : `AND status = 'sending'`;
  await db.runAsync(`UPDATE messages SET status = ? WHERE id = ? ${whereClause}`, [status, messageId]);
}

export async function updateMessageId(oldId: string, newId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`UPDATE messages SET id = ? WHERE id = ?`, [newId, oldId]);
}

export async function deleteMessage(messageId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`UPDATE messages SET is_deleted = 1 WHERE id = ?`, [messageId]);
}

function mapRowToMessage(row: any): Message {
  return {
    id: row.id,
    chatId: row.chat_id,
    senderUsername: row.sender_username,
    contentType: row.content_type,
    contentText: row.content_text,
    contentUri: row.content_uri,
    mediaMimeType: row.media_mime_type,
    isEncrypted: row.is_encrypted === 1,
    timestamp: row.timestamp,
    status: row.status,
    replyToId: row.reply_to_id,
    replyToText: row.reply_to_text,
    replyToUsername: row.reply_to_username,
    forwardedFrom: row.forwarded_from || null,
    isDeleted: row.is_deleted === 1,
    deleteAt: row.delete_at,
  };
}
