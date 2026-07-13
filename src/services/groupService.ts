import { getDatabase } from '../database/connection';

export interface GroupData {
  id: string;
  name: string;
  description: string | null;
  avatarUri: string | null;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  memberCount: number;
  lastMessageText: string | null;
  lastMessageTime: number | null;
  isChannel: boolean;
  ownerUsername: string | null;
  adminUsernames: string[];
}

export interface GroupMember {
  groupId: string;
  username: string;
  joinedAt: number;
}

export interface GroupMessage {
  id: string;
  groupId: string;
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
  forwardedFrom?: string | null;
  isSystem: boolean;
  isDeleted: boolean;
}

export async function ensureGroupExistsLocally(groupId: string, fallbackName: string, myUsername: string): Promise<void> {
  const db = await getDatabase();
  const existing = await db.getFirstAsync<{ id: string }>(`SELECT id FROM groups_data WHERE id = ?`, [groupId]);
  if (existing) return;
  const now = Date.now();
  await db.runAsync(
    `INSERT OR IGNORE INTO groups_data (id, name, description, avatar_uri, created_by, created_at, updated_at, is_channel, owner_username, admin_usernames)
     VALUES (?, ?, '', '', ?, ?, ?, 0, ?, '[]')`,
    [groupId, fallbackName, myUsername, now, now, myUsername]
  );
}

export async function upsertGroup(group: {
  id: string;
  name: string;
  description?: string;
  avatar_uri?: string;
  created_by: string;
  created_at: number;
  updated_at: number;
  is_channel?: boolean;
  owner_username?: string | null;
  admin_usernames?: string[];
}): Promise<void> {
  const db = await getDatabase();
  const adminJson = group.admin_usernames ? JSON.stringify(group.admin_usernames) : null;
  await db.runAsync(
    `INSERT INTO groups_data (id, name, description, avatar_uri, created_by, created_at, updated_at, is_channel, owner_username, admin_usernames)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       description = excluded.description,
       avatar_uri = excluded.avatar_uri,
       updated_at = excluded.updated_at,
       is_channel = excluded.is_channel,
       owner_username = excluded.owner_username,
       admin_usernames = excluded.admin_usernames`,
    [group.id, group.name, group.description || null, group.avatar_uri || null, group.created_by, group.created_at, group.updated_at, group.is_channel ? 1 : 0, group.owner_username || null, adminJson]
  );
}

export async function getGroupById(groupId: string): Promise<GroupData | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<any>(
    `SELECT g.*, (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count,
            (SELECT content_type FROM group_messages WHERE group_id = g.id AND is_deleted = 0 AND content_type NOT IN ('reaction', 'system') ORDER BY timestamp DESC LIMIT 1) as last_content_type,
            (SELECT content_text FROM group_messages WHERE group_id = g.id AND is_deleted = 0 AND content_type NOT IN ('reaction', 'system') ORDER BY timestamp DESC LIMIT 1) as last_message_text,
            (SELECT content_uri FROM group_messages WHERE group_id = g.id AND is_deleted = 0 AND content_type NOT IN ('reaction', 'system') ORDER BY timestamp DESC LIMIT 1) as last_content_uri,
            (SELECT timestamp FROM group_messages WHERE group_id = g.id AND is_deleted = 0 AND content_type NOT IN ('reaction', 'system') ORDER BY timestamp DESC LIMIT 1) as last_message_time
     FROM groups_data g WHERE g.id = ?`,
    [groupId]
  );
  if (!row) return null;
  return mapRowToGroupData(row);
}

export async function getAllGroups(): Promise<GroupData[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    `SELECT g.*,
            (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count,
            (SELECT content_type FROM group_messages WHERE group_id = g.id AND is_deleted = 0 AND content_type NOT IN ('reaction', 'system') ORDER BY timestamp DESC LIMIT 1) as last_content_type,
            (SELECT content_text FROM group_messages WHERE group_id = g.id AND is_deleted = 0 AND content_type NOT IN ('reaction', 'system') ORDER BY timestamp DESC LIMIT 1) as last_message_text,
            (SELECT content_uri FROM group_messages WHERE group_id = g.id AND is_deleted = 0 AND content_type NOT IN ('reaction', 'system') ORDER BY timestamp DESC LIMIT 1) as last_content_uri,
            (SELECT timestamp FROM group_messages WHERE group_id = g.id AND is_deleted = 0 AND content_type NOT IN ('reaction', 'system') ORDER BY timestamp DESC LIMIT 1) as last_message_time
     FROM groups_data g
     ORDER BY COALESCE((SELECT MAX(timestamp) FROM group_messages WHERE group_id = g.id AND is_deleted = 0 AND content_type NOT IN ('reaction', 'system')), g.created_at) DESC`
  );
  return rows.map(mapRowToGroupData);
}

export async function updateGroupAdminFields(groupId: string, ownerUsername: string | null, adminUsernames: string[]): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE groups_data SET owner_username = ?, admin_usernames = ?, updated_at = ? WHERE id = ?`,
    [ownerUsername, adminUsernames.length > 0 ? JSON.stringify(adminUsernames) : null, Date.now(), groupId]
  );
}

export async function isGroupAdmin(groupId: string, username: string): Promise<boolean> {
  const group = await getGroupById(groupId);
  if (!group) return false;
  if (group.ownerUsername === username) return true;
  if (group.adminUsernames.includes(username)) return true;
  return false;
}

export async function updateGroupInfo(groupId: string, updates: { name?: string; description?: string; avatar_uri?: string }): Promise<void> {
  const db = await getDatabase();
  const sets: string[] = [];
  const vals: any[] = [];
  if (updates.name !== undefined) { sets.push('name = ?'); vals.push(updates.name); }
  if (updates.description !== undefined) { sets.push('description = ?'); vals.push(updates.description || null); }
  if (updates.avatar_uri !== undefined) { sets.push('avatar_uri = ?'); vals.push(updates.avatar_uri || null); }
  sets.push('updated_at = ?');
  vals.push(Date.now());
  vals.push(groupId);
  await db.runAsync(`UPDATE groups_data SET ${sets.join(', ')} WHERE id = ?`, vals);
}

export async function deleteGroupLocally(groupId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`DELETE FROM group_messages WHERE group_id = ?`, [groupId]);
  await db.runAsync(`DELETE FROM group_members WHERE group_id = ?`, [groupId]);
  await db.runAsync(`DELETE FROM groups_data WHERE id = ?`, [groupId]);
}

// ─── Members ───────────────────────────────────────────────────

export async function upsertGroupMembers(groupId: string, members: string[]): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  for (const username of members) {
    await db.runAsync(
      `INSERT OR REPLACE INTO group_members (group_id, username, joined_at) VALUES (?, ?, ?)`,
      [groupId, username, now]
    );
  }
}

export async function getGroupMembers(groupId: string): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    `SELECT username FROM group_members WHERE group_id = ? ORDER BY joined_at ASC`,
    [groupId]
  );
  return rows.map(r => r.username);
}

export async function isGroupMember(groupId: string, username: string): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<any>(
    `SELECT 1 FROM group_members WHERE group_id = ? AND username = ?`,
    [groupId, username]
  );
  return !!row;
}

export async function removeGroupMemberLocally(groupId: string, username: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`DELETE FROM group_members WHERE group_id = ? AND username = ?`, [groupId, username]);
}

// ─── Messages ──────────────────────────────────────────────────

export async function saveGroupMessage(msg: {
  id: string;
  group_id: string;
  sender_username: string;
  content_type: string;
  content_text?: string;
  content_uri?: string;
  media_mime_type?: string;
  reply_to_id?: string;
  reply_to_text?: string;
  timestamp: number;
  is_system?: number;
  status?: string;
  forwarded_from?: string;
}): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR IGNORE INTO group_messages (id, group_id, sender_username, content_type, content_text, content_uri, media_mime_type, reply_to_id, reply_to_text, timestamp, status, is_system, forwarded_from)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [msg.id, msg.group_id, msg.sender_username, msg.content_type, msg.content_text || null, msg.content_uri || null, msg.media_mime_type || null, msg.reply_to_id || null, msg.reply_to_text || null, msg.timestamp, msg.status || 'sent', msg.is_system || 0, msg.forwarded_from || null]
  );
  await db.runAsync(`UPDATE groups_data SET updated_at = ? WHERE id = ?`, [msg.timestamp, msg.group_id]);
}

export async function getGroupMessages(groupId: string, limit: number = 100): Promise<GroupMessage[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM group_messages WHERE group_id = ? AND is_deleted = 0 AND content_type != 'reaction' ORDER BY timestamp ASC, id ASC LIMIT ?`,
    [groupId, limit]
  );
  return rows.map(mapRowToGroupMessage);
}

export async function updateGroupMessageId(oldId: string, newId: string): Promise<void> {
  const db = await getDatabase();
  // If newId already exists (WebSocket arrived first), just delete the old local-ID row
  const existing = await db.getFirstAsync<{ id: string }>(`SELECT id FROM group_messages WHERE id = ?`, [newId]);
  if (existing) {
    await db.runAsync(`DELETE FROM group_messages WHERE id = ?`, [oldId]);
    return;
  }
  await db.runAsync(`UPDATE group_messages SET id = ? WHERE id = ?`, [newId, oldId]);
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

export async function saveGroupMessageRead(messageId: string, username: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR IGNORE INTO group_message_reads (message_id, username, read_at) VALUES (?, ?, ?)`,
    [messageId, username, Date.now()]
  );
}

export async function getGroupMessageReadCount(messageId: string): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<any>(
    `SELECT COUNT(*) as cnt FROM group_message_reads WHERE message_id = ?`,
    [messageId]
  );
  return row?.cnt || 0;
}

export async function getGroupMessageReadsForMessages(messageIds: string[]): Promise<Map<string, number>> {
  if (messageIds.length === 0) return new Map();
  const db = await getDatabase();
  const placeholders = messageIds.map(() => '?').join(',');
  const rows = await db.getAllAsync<any>(
    `SELECT message_id, COUNT(*) as cnt FROM group_message_reads WHERE message_id IN (${placeholders}) GROUP BY message_id`,
    messageIds
  );
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.message_id, row.cnt);
  }
  return map;
}

export async function updateGroupLastMessageTime(groupId: string): Promise<void> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<any>(
    `SELECT timestamp FROM group_messages WHERE group_id = ? AND is_deleted = 0 AND content_type NOT IN ('reaction', 'system') ORDER BY timestamp DESC LIMIT 1`,
    [groupId]
  );
  if (row) {
    await db.runAsync(`UPDATE groups_data SET updated_at = ? WHERE id = ?`, [row.timestamp, groupId]);
  }
}

function mapRowToGroupData(row: any): GroupData {
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
  let adminUsernames: string[] = [];
  if (row.admin_usernames) {
    try { adminUsernames = JSON.parse(row.admin_usernames); } catch {}
  }
  return {
    id: row.id,
    name: row.name,
    description: row.description || null,
    avatarUri: row.avatar_uri || null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    memberCount: row.member_count || 0,
    lastMessageText,
    lastMessageTime: row.last_message_time || null,
    isChannel: row.is_channel === 1,
    ownerUsername: row.owner_username || null,
    adminUsernames,
  };
}

function mapRowToGroupMessage(row: any): GroupMessage {
  return {
    id: row.id,
    groupId: row.group_id,
    senderUsername: row.sender_username,
    contentType: row.content_type,
    contentText: row.content_text,
    contentUri: row.content_uri,
    mediaMimeType: row.media_mime_type || null,
    replyToId: row.reply_to_id || null,
    replyToText: row.reply_to_text || null,
    replyToUsername: row.reply_to_username || null,
    timestamp: row.timestamp,
    status: row.status || 'sent',
    forwardedFrom: row.forwarded_from || null,
    isSystem: row.is_system === 1,
    isDeleted: row.is_deleted === 1,
  };
}
