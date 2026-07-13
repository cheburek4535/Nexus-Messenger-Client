import { getDatabase } from '../database/connection';

export interface ChannelData {
  id: string;
  name: string;
  description: string | null;
  avatarUri: string | null;
  ownerUsername: string;
  createdAt: number;
  updatedAt: number;
  memberCount: number;
  lastMessageText: string | null;
  lastMessageTime: number | null;
}

export interface ChannelMessage {
  id: string;
  channelId: string;
  senderUsername: string;
  contentType: 'text' | 'image' | 'file' | 'voice' | 'video' | 'system';
  contentText: string | null;
  contentUri: string | null;
  mediaMimeType: string | null;
  replyToId: string | null;
  replyToText: string | null;
  replyToUsername: string | null;
  timestamp: number;
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  isSystem: boolean;
  forwardedFrom?: string | null;
  isDeleted: boolean;
}

export async function ensureChannelExistsLocally(channelId: string, fallbackName: string, myUsername: string): Promise<void> {
  const db = await getDatabase();
  const existing = await db.getFirstAsync<{ id: string }>(`SELECT id FROM channels_data WHERE id = ?`, [channelId]);
  if (existing) return;
  const now = Date.now();
  await db.runAsync(
    `INSERT OR IGNORE INTO channels_data (id, name, description, avatar_uri, owner_username, created_at, updated_at)
     VALUES (?, ?, '', '', ?, ?, ?)`,
    [channelId, fallbackName, myUsername, now, now]
  );
}

export async function upsertChannel(channel: {
  id: string;
  name: string;
  description?: string;
  avatar_uri?: string;
  owner_username: string;
  created_at: number;
  updated_at: number;
}): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO channels_data (id, name, description, avatar_uri, owner_username, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       description = excluded.description,
       avatar_uri = excluded.avatar_uri,
       updated_at = excluded.updated_at,
       owner_username = excluded.owner_username`,
    [channel.id, channel.name, channel.description || null, channel.avatar_uri || null, channel.owner_username, channel.created_at, channel.updated_at]
  );
}

export async function getChannelById(channelId: string): Promise<ChannelData | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<any>(
    `SELECT c.*,
            (SELECT COUNT(*) FROM channel_members WHERE channel_id = c.id) as member_count,
            (SELECT content_type FROM channel_messages WHERE channel_id = c.id AND is_deleted = 0 AND content_type NOT IN ('reaction', 'system') ORDER BY timestamp DESC LIMIT 1) as last_content_type,
            (SELECT content_text FROM channel_messages WHERE channel_id = c.id AND is_deleted = 0 AND content_type NOT IN ('reaction', 'system') ORDER BY timestamp DESC LIMIT 1) as last_message_text,
            (SELECT content_uri FROM channel_messages WHERE channel_id = c.id AND is_deleted = 0 AND content_type NOT IN ('reaction', 'system') ORDER BY timestamp DESC LIMIT 1) as last_content_uri,
            (SELECT timestamp FROM channel_messages WHERE channel_id = c.id AND is_deleted = 0 AND content_type NOT IN ('reaction', 'system') ORDER BY timestamp DESC LIMIT 1) as last_message_time
     FROM channels_data c WHERE c.id = ?`,
    [channelId]
  );
  if (!row) return null;
  return mapRowToChannelData(row);
}

export async function getAllChannels(): Promise<ChannelData[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    `SELECT c.*,
            (SELECT COUNT(*) FROM channel_members WHERE channel_id = c.id) as member_count,
            (SELECT content_type FROM channel_messages WHERE channel_id = c.id AND is_deleted = 0 AND content_type NOT IN ('reaction', 'system') ORDER BY timestamp DESC LIMIT 1) as last_content_type,
            (SELECT content_text FROM channel_messages WHERE channel_id = c.id AND is_deleted = 0 AND content_type NOT IN ('reaction', 'system') ORDER BY timestamp DESC LIMIT 1) as last_message_text,
            (SELECT content_uri FROM channel_messages WHERE channel_id = c.id AND is_deleted = 0 AND content_type NOT IN ('reaction', 'system') ORDER BY timestamp DESC LIMIT 1) as last_content_uri,
            (SELECT timestamp FROM channel_messages WHERE channel_id = c.id AND is_deleted = 0 AND content_type NOT IN ('reaction', 'system') ORDER BY timestamp DESC LIMIT 1) as last_message_time
     FROM channels_data c
     ORDER BY COALESCE((SELECT MAX(timestamp) FROM channel_messages WHERE channel_id = c.id AND is_deleted = 0 AND content_type NOT IN ('reaction', 'system')), c.created_at) DESC`
  );
  return rows.map(mapRowToChannelData);
}

export async function updateChannelInfo(channelId: string, updates: { name?: string; description?: string; avatar_uri?: string }): Promise<void> {
  const db = await getDatabase();
  const sets: string[] = [];
  const vals: any[] = [];
  if (updates.name !== undefined) { sets.push('name = ?'); vals.push(updates.name); }
  if (updates.description !== undefined) { sets.push('description = ?'); vals.push(updates.description || null); }
  if (updates.avatar_uri !== undefined) { sets.push('avatar_uri = ?'); vals.push(updates.avatar_uri || null); }
  if (sets.length === 0) return;
  sets.push('updated_at = ?');
  vals.push(Date.now());
  vals.push(channelId);
  await db.runAsync(`UPDATE channels_data SET ${sets.join(', ')} WHERE id = ?`, vals);
}

export async function upsertChannelMembers(channelId: string, usernames: string[]): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  for (const username of usernames) {
    await db.runAsync(
      `INSERT OR IGNORE INTO channel_members (channel_id, username, joined_at) VALUES (?, ?, ?)`,
      [channelId, username, now]
    );
  }
}

export async function getChannelMembers(channelId: string): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    `SELECT username FROM channel_members WHERE channel_id = ? ORDER BY joined_at ASC`,
    [channelId]
  );
  return rows.map((r: any) => r.username);
}

export async function isChannelOwner(channelId: string, username: string): Promise<boolean> {
  const channel = await getChannelById(channelId);
  if (!channel) return false;
  return channel.ownerUsername === username;
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

export async function saveChannelMessage(msg: {
  id: string;
  channel_id: string;
  sender_username: string;
  content_type?: string;
  content_text?: string;
  content_uri?: string;
  media_mime_type?: string;
  reply_to_id?: string;
  reply_to_text?: string;
  timestamp: number;
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  is_system?: number;
  forwarded_from?: string;
}): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR IGNORE INTO channel_messages (id, channel_id, sender_username, content_type, content_text, content_uri, media_mime_type, reply_to_id, reply_to_text, timestamp, status, is_system, forwarded_from)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [msg.id, msg.channel_id, msg.sender_username, msg.content_type || 'text', msg.content_text || null, msg.content_uri || null, msg.media_mime_type || null, msg.reply_to_id || null, msg.reply_to_text || null, msg.timestamp, msg.status || 'sent', msg.is_system || 0, msg.forwarded_from || null]
  );
  await db.runAsync(`UPDATE channels_data SET updated_at = ? WHERE id = ?`, [msg.timestamp, msg.channel_id]);
}

export async function getChannelMessages(channelId: string, limit: number = 50): Promise<ChannelMessage[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM channel_messages WHERE channel_id = ? AND is_deleted = 0 ORDER BY timestamp ASC, id ASC LIMIT ?`,
    [channelId, limit]
  );
  return rows.map(mapRowToChannelMessage);
}

export async function deleteChannelLocally(channelId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`DELETE FROM channel_messages WHERE channel_id = ?`, [channelId]);
  await db.runAsync(`DELETE FROM channel_members WHERE channel_id = ?`, [channelId]);
  await db.runAsync(`DELETE FROM channels_data WHERE id = ?`, [channelId]);
}

export async function removeChannelMemberLocally(channelId: string, username: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `DELETE FROM channel_members WHERE channel_id = ? AND username = ?`,
    [channelId, username]
  );
}



function mapRowToChannelData(row: any): ChannelData {
  let lastMessageText: string | null = null;
  if (row.last_message_text != null && row.last_message_text !== '') {
    lastMessageText = row.last_message_text;
  } else if (row.last_content_type === 'image') {
    lastMessageText = '📷 Image';
  } else if (row.last_content_type === 'voice') {
    lastMessageText = '🎤 Voice message';
  } else if (row.last_content_type === 'video') {
    lastMessageText = '🎬 Video';
  }
  return {
    id: row.id,
    name: row.name,
    description: row.description || null,
    avatarUri: row.avatar_uri || null,
    ownerUsername: row.owner_username,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    memberCount: row.member_count || 0,
    lastMessageText,
    lastMessageTime: row.last_message_time || null,
  };
}

function mapRowToChannelMessage(row: any): ChannelMessage {
  return {
    id: row.id,
    channelId: row.channel_id,
    senderUsername: row.sender_username,
    contentType: row.content_type as 'text' | 'image' | 'voice' | 'system',
    contentText: row.content_text || null,
    contentUri: row.content_uri || null,
    mediaMimeType: row.media_mime_type || null,
    replyToId: row.reply_to_id || null,
    replyToText: row.reply_to_text || null,
    replyToUsername: row.reply_to_username || null,
    timestamp: row.timestamp,
    status: row.status || 'sent',
    isSystem: row.is_system === 1,
    forwardedFrom: row.forwarded_from || null,
    isDeleted: row.is_deleted === 1,
  };
}
