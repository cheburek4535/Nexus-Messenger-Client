import { getDatabase } from '../database/connection';

export interface GroupMessage {
  id: string;
  groupId: string;
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

export interface SendGroupMessageOptions {
  groupId: string;
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

export async function sendGroupMessage(opts: SendGroupMessageOptions): Promise<GroupMessage> {
  const {
    groupId, senderUsername, contentText = null,
    contentType = 'text', contentUri = null,
    mediaMimeType = null, replyToId = null, replyToText = null, replyToUsername = null, forwardedFrom = null,
  } = opts;

  const db = await getDatabase();
  const id = `grpmsg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const timestamp = Date.now();

  const group = await db.getFirstAsync<any>(`SELECT id FROM groups_data WHERE id = ?`, [groupId]);
  if (!group) {
    throw new Error(`Group ${groupId} not found`);
  }

  const displayText = replyToText
    ? `↪ ${replyToText.substring(0, 30)}: ${contentText ?? ''}`
    : (contentText ?? `[${contentType}]`);

  await db.runAsync(
    `INSERT INTO group_messages (id, group_id, sender_username, content_type, content_text, content_uri, media_mime_type, timestamp, status, reply_to_id, reply_to_text, reply_to_username, forwarded_from, is_system, is_deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, groupId, senderUsername, contentType, contentText, contentUri, mediaMimeType, timestamp, 'sending', replyToId, replyToText, replyToUsername, forwardedFrom, 0, 0]
  );

  await db.runAsync(
    `UPDATE groups_data SET last_message_text = ?, last_message_time = ?, updated_at = ? WHERE id = ?`,
    [displayText, timestamp, Date.now(), groupId]
  );

  return {
    id, groupId, senderUsername, contentType, contentText,
    contentUri, mediaMimeType, timestamp,
    status: 'sending', replyToId, replyToText, replyToUsername, forwardedFrom,
    isSystem: false, isDeleted: false,
  };
}

export async function saveIncomingGroupMessage(
  groupId: string,
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
): Promise<GroupMessage> {
  const db = await getDatabase();
  const id = messageId || `grpmsg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const ts = timestamp || Date.now();
  const ct = contentType || 'text';

  // Ensure group exists locally (create minimal entry if missing)
  const existingGroup = await db.getFirstAsync<any>(`SELECT id FROM groups_data WHERE id = ?`, [groupId]);
  if (!existingGroup) {
    await db.runAsync(
      `INSERT OR IGNORE INTO groups_data (id, name, description, avatar_uri, created_by, created_at, updated_at, is_channel, owner_username, admin_usernames, last_message_text, last_message_time)
       VALUES (?, ?, '', '', ?, ?, ?, 0, ?, '[]', '', 0)`,
      [groupId, groupId, senderUsername, ts, ts, senderUsername]
    );
  }

  const existing = await db.getFirstAsync<any>(`SELECT id FROM group_messages WHERE id = ?`, [id]);

  if (existing) {
    await db.runAsync(`UPDATE group_messages SET status = 'delivered' WHERE id = ? AND status NOT IN ('read', 'delivered', 'failed')`, [id]);
  } else {
    await db.runAsync(
      `INSERT INTO group_messages (id, group_id, sender_username, content_type, content_text, content_uri, media_mime_type, timestamp, status, reply_to_id, reply_to_text, reply_to_username, forwarded_from, is_system, is_deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, groupId, senderUsername, ct, contentText, contentUri ?? null, mediaMimeType ?? null, ts, 'delivered', replyToId ?? null, replyToText ?? null, replyToUsername ?? null, forwardedFrom ?? null, isSystem ? 1 : 0, 0]
    );
  }

  if (!isSystem) {
    const displayText = replyToText
      ? `↪ ${replyToText.substring(0, 30)}: ${contentText ?? ''}`
      : (contentText ?? `[${ct}]`);

    try {
      await db.runAsync(
        `UPDATE groups_data SET last_message_text = ?, last_message_time = ?, updated_at = ? WHERE id = ?`,
        [displayText, ts, Date.now(), groupId]
      );
    } catch (error) {
      // Columns might not exist yet if migration hasn't run
      console.warn('Could not update last_message columns:', error);
    }
  }

  return {
    id, groupId, senderUsername, contentType: ct, contentText,
    contentUri: contentUri ?? null, mediaMimeType: mediaMimeType ?? null,
    timestamp: ts, status: 'delivered',
    replyToId: replyToId ?? null, replyToText: replyToText ?? null,
    replyToUsername: replyToUsername ?? null,
    forwardedFrom: forwardedFrom ?? null,
    isSystem, isDeleted: false,
  };
}

export async function getGroupMessages(groupId: string, limit: number = 100): Promise<GroupMessage[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM group_messages WHERE group_id = ? AND is_deleted = 0 AND content_type != 'reaction' ORDER BY timestamp ASC, id ASC LIMIT ?`,
    [groupId, limit]
  );
  return rows.map(mapRowToGroupMessage);
}

export async function updateGroupMessageStatus(messageId: string, status: 'sent' | 'delivered' | 'read' | 'failed'): Promise<void> {
  const db = await getDatabase();
  const whereClause = status === 'read' || status === 'failed'
    ? ''
    : status === 'delivered'
      ? `AND status IN ('sending', 'sent')`
      : `AND status = 'sending'`;
  await db.runAsync(`UPDATE group_messages SET status = ? WHERE id = ? ${whereClause}`, [status, messageId]);
}

export async function updateGroupMessageId(oldId: string, newId: string): Promise<void> {
  const db = await getDatabase();
  const existing = await db.getFirstAsync<{ id: string }>(`SELECT id FROM group_messages WHERE id = ?`, [newId]);
  if (existing) {
    await db.runAsync(`DELETE FROM group_messages WHERE id = ?`, [oldId]);
    return;
  }
  await db.runAsync(`UPDATE group_messages SET id = ? WHERE id = ?`, [newId, oldId]);
}

function mapRowToGroupMessage(row: any): GroupMessage {
  return {
    id: row.id,
    groupId: row.group_id,
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