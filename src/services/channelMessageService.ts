import { getDatabase } from '../database/connection';

export interface ChannelMessage {
  id: string;
  channelId: string;
  senderUsername: string;
  contentType: 'text' | 'image' | 'file' | 'video' | 'voice' | 'system';
  contentText: string | null;
  contentUri: string | null;
  mediaMimeType: string | null;
  replyToId: string | null;
  replyToText: string | null;
  replyToUsername: string | null;
  timestamp: number;
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  forwardedFrom?: string | null;
  isSystem: boolean;
  isDeleted: boolean;
}

export interface SendChannelMessageOptions {
  channelId: string;
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

export async function sendChannelMessage(opts: SendChannelMessageOptions): Promise<ChannelMessage> {
  const {
    channelId, senderUsername, contentText = null,
    contentType = 'text', contentUri = null,
    mediaMimeType = null, replyToId = null, replyToText = null, replyToUsername = null, forwardedFrom = null,
  } = opts;

  const db = await getDatabase();
  const id = `chmsg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const timestamp = Date.now();

  const channel = await db.getFirstAsync<any>(`SELECT id FROM channels_data WHERE id = ?`, [channelId]);
  if (!channel) {
    throw new Error(`Channel ${channelId} not found`);
  }

  const displayText = replyToText
    ? `↪ ${replyToText.substring(0, 30)}: ${contentText ?? ''}`
    : (contentText ?? `[${contentType}]`);

  await db.runAsync(
    `INSERT INTO channel_messages (id, channel_id, sender_username, content_type, content_text, content_uri, media_mime_type, timestamp, status, reply_to_id, reply_to_text, reply_to_username, forwarded_from, is_system, is_deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, channelId, senderUsername, contentType, contentText, contentUri, mediaMimeType, timestamp, 'sending', replyToId, replyToText, replyToUsername, forwardedFrom, 0, 0]
  );

  await db.runAsync(
    `UPDATE channels_data SET last_message_text = ?, last_message_time = ?, updated_at = ? WHERE id = ?`,
    [displayText, timestamp, Date.now(), channelId]
  );

  return {
    id, channelId, senderUsername, contentType, contentText,
    contentUri, mediaMimeType, timestamp,
    status: 'sending', replyToId, replyToText, replyToUsername, forwardedFrom,
    isSystem: false, isDeleted: false,
  };
}

export async function saveIncomingChannelMessage(
  channelId: string,
  senderUsername: string,
  contentText: string,
  {
    messageId, timestamp, contentType, contentUri, mediaMimeType,
    replyToId, replyToText, replyToUsername, forwardedFrom,
    isSystem = false,
  }: {
    messageId?: string;
    timestamp?: number;
    contentType?: 'text' | 'image' | 'file' | 'video' | 'voice' | 'system';
    contentUri?: string | null;
    mediaMimeType?: string | null;
    replyToId?: string | null;
    replyToText?: string | null;
    replyToUsername?: string | null;
    forwardedFrom?: string;
    isSystem?: boolean;
  } = {}
): Promise<ChannelMessage> {
  const db = await getDatabase();
  const id = messageId || `chmsg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const ts = timestamp || Date.now();
  const ct = contentType || 'text';

  // Ensure channel exists locally (create minimal entry if missing)
  const existingChannel = await db.getFirstAsync<any>(`SELECT id FROM channels_data WHERE id = ?`, [channelId]);
  if (!existingChannel) {
    await db.runAsync(
      `INSERT OR IGNORE INTO channels_data (id, name, description, avatar_uri, owner_username, created_at, updated_at)
       VALUES (?, ?, '', '', ?, ?, ?)`,
      [channelId, channelId, senderUsername, ts, ts]
    );
  }

  const existing = await db.getFirstAsync<any>(`SELECT id FROM channel_messages WHERE id = ?`, [id]);

  if (existing) {
    await db.runAsync(`UPDATE channel_messages SET status = 'delivered' WHERE id = ? AND status NOT IN ('read', 'delivered', 'failed')`, [id]);
  } else {
    await db.runAsync(
      `INSERT INTO channel_messages (id, channel_id, sender_username, content_type, content_text, content_uri, media_mime_type, timestamp, status, reply_to_id, reply_to_text, reply_to_username, forwarded_from, is_system, is_deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, channelId, senderUsername, ct, contentText, contentUri ?? null, mediaMimeType ?? null, ts, 'delivered', replyToId ?? null, replyToText ?? null, replyToUsername ?? null, forwardedFrom ?? null, isSystem ? 1 : 0, 0]
    );
  }

  if (!isSystem) {
    const displayText = replyToText
      ? `↪ ${replyToText.substring(0, 30)}: ${contentText ?? ''}`
      : (contentText ?? `[${ct}]`);

    try {
      await db.runAsync(
        `UPDATE channels_data SET last_message_text = ?, last_message_time = ?, updated_at = ? WHERE id = ?`,
        [displayText, ts, Date.now(), channelId]
      );
    } catch (error) {
      console.warn('Could not update last_message columns:', error);
    }
  }

  return {
    id, channelId, senderUsername, contentType: ct, contentText,
    contentUri: contentUri ?? null, mediaMimeType: mediaMimeType ?? null,
    timestamp: ts, status: 'delivered',
    replyToId: replyToId ?? null, replyToText: replyToText ?? null,
    replyToUsername: replyToUsername ?? null,
    forwardedFrom: forwardedFrom ?? null,
    isSystem, isDeleted: false,
  };
}

export async function getChannelMessages(channelId: string, limit: number = 100): Promise<ChannelMessage[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM channel_messages WHERE channel_id = ? AND is_deleted = 0 ORDER BY timestamp ASC, id ASC LIMIT ?`,
    [channelId, limit]
  );
  return rows.map(mapRowToChannelMessage);
}

export async function updateChannelMessageStatus(messageId: string, status: 'sent' | 'delivered' | 'read' | 'failed'): Promise<void> {
  const db = await getDatabase();
  const whereClause = status === 'read' || status === 'failed'
    ? ''
    : status === 'delivered'
      ? `AND status IN ('sending', 'sent')`
      : `AND status = 'sending'`;
  await db.runAsync(`UPDATE channel_messages SET status = ? WHERE id = ? ${whereClause}`, [status, messageId]);
}

export async function updateChannelMessageId(oldId: string, newId: string): Promise<void> {
  const db = await getDatabase();
  const existing = await db.getFirstAsync<{ id: string }>(`SELECT id FROM channel_messages WHERE id = ?`, [newId]);
  if (existing) {
    await db.runAsync(`DELETE FROM channel_messages WHERE id = ?`, [oldId]);
    return;
  }
  await db.runAsync(`UPDATE channel_messages SET id = ? WHERE id = ?`, [newId, oldId]);
}

function mapRowToChannelMessage(row: any): ChannelMessage {
  return {
    id: row.id,
    channelId: row.channel_id,
    senderUsername: row.sender_username,
    contentType: row.content_type,
    contentText: row.content_text,
    contentUri: row.content_uri,
    mediaMimeType: row.media_mime_type,
    replyToId: row.reply_to_id,
    replyToText: row.reply_to_text,
    replyToUsername: row.reply_to_username,
    timestamp: row.timestamp,
    status: row.status,
    forwardedFrom: row.forwarded_from || null,
    isSystem: row.is_system === 1,
    isDeleted: row.is_deleted === 1,
  };
}