export const SCHEMA_VERSION = 10;

export const CREATE_TABLES = [
  // Сначала создаём settings, так как она нужна для миграций
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`,

  // Затем основные таблицы
  `CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY NOT NULL,
    username TEXT NOT NULL,
    display_name TEXT,
    avatar_uri TEXT,
    last_message_text TEXT,
    last_message_time INTEGER,
    unread_count INTEGER DEFAULT 0,
    is_ghost INTEGER DEFAULT 0,
    auto_delete_timer INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY NOT NULL,
    chat_id TEXT NOT NULL,
    sender_username TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'text',
    content_text TEXT,
    content_uri TEXT,
    is_encrypted INTEGER DEFAULT 1,
    timestamp INTEGER NOT NULL,
    status TEXT DEFAULT 'sent',
    reply_to_id TEXT,
    reply_to_text TEXT,
    reply_to_username TEXT,
    media_mime_type TEXT,
    forwarded_from TEXT,
    is_deleted INTEGER DEFAULT 0,
    delete_at INTEGER,
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS drafts (
    chat_id TEXT PRIMARY KEY NOT NULL,
    draft_text TEXT,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS contacts (
    username TEXT PRIMARY KEY NOT NULL,
    public_key TEXT,
    display_name TEXT,
    avatar_uri TEXT,
    last_seen INTEGER,
    created_at INTEGER NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS blocked_users (
    username TEXT PRIMARY KEY NOT NULL,
    blocked_at INTEGER NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS groups_data (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    avatar_uri TEXT,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    is_channel INTEGER DEFAULT 0,
    owner_username TEXT,
    admin_usernames TEXT,
    last_message_text TEXT,
    last_message_time INTEGER
  )`,

  `CREATE TABLE IF NOT EXISTS group_members (
    group_id TEXT NOT NULL,
    username TEXT NOT NULL,
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (group_id, username),
    FOREIGN KEY (group_id) REFERENCES groups_data(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS group_messages (
    id TEXT PRIMARY KEY NOT NULL,
    group_id TEXT NOT NULL,
    sender_username TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'text',
    content_text TEXT,
    content_uri TEXT,
    media_mime_type TEXT,
    reply_to_id TEXT,
    reply_to_text TEXT,
    reply_to_username TEXT,
    timestamp INTEGER NOT NULL,
    status TEXT DEFAULT 'sent',
    is_system INTEGER DEFAULT 0,
    is_deleted INTEGER DEFAULT 0,
    forwarded_from TEXT,
    FOREIGN KEY (group_id) REFERENCES groups_data(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS message_reactions (
    message_id TEXT NOT NULL,
    username TEXT NOT NULL,
    reaction TEXT NOT NULL,
    chat_id TEXT,
    group_id TEXT,
    timestamp INTEGER NOT NULL,
    PRIMARY KEY (message_id, username)
  )`,

  `CREATE TABLE IF NOT EXISTS group_message_reads (
    message_id TEXT NOT NULL,
    username TEXT NOT NULL,
    read_at INTEGER NOT NULL,
    PRIMARY KEY (message_id, username),
    FOREIGN KEY (message_id) REFERENCES group_messages(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS channels_data (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    avatar_uri TEXT,
    owner_username TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_message_text TEXT,
    last_message_time INTEGER
  )`,

  `CREATE TABLE IF NOT EXISTS channel_members (
    channel_id TEXT NOT NULL,
    username TEXT NOT NULL,
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (channel_id, username),
    FOREIGN KEY (channel_id) REFERENCES channels_data(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS channel_messages (
    id TEXT PRIMARY KEY NOT NULL,
    channel_id TEXT NOT NULL,
    sender_username TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'text',
    content_text TEXT,
    content_uri TEXT,
    media_mime_type TEXT,
    reply_to_id TEXT,
    reply_to_text TEXT,
    reply_to_username TEXT,
    timestamp INTEGER NOT NULL,
    status TEXT DEFAULT 'sent',
    is_system INTEGER DEFAULT 0,
    is_deleted INTEGER DEFAULT 0,
    forwarded_from TEXT,
    FOREIGN KEY (channel_id) REFERENCES channels_data(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS saved_messages (
    id TEXT PRIMARY KEY NOT NULL,
    sender_username TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'text',
    content_text TEXT,
    content_uri TEXT,
    media_mime_type TEXT,
    timestamp INTEGER NOT NULL,
    reply_to_id TEXT,
    reply_to_text TEXT,
    reply_to_username TEXT,
    forwarded_from TEXT,
    is_deleted INTEGER DEFAULT 0
  )`,
];

// Индексы создаём отдельно, чтобы не зависеть от порядка
export const CREATE_INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id)`,
  `CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_chats_updated ON chats(updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_messages_delete_at ON messages(delete_at)`,
  `CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key)`,
  `CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id)`,
  `CREATE INDEX IF NOT EXISTS idx_group_messages_group ON group_messages(group_id)`,
  `CREATE INDEX IF NOT EXISTS idx_group_messages_ts ON group_messages(timestamp DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_reactions_message ON message_reactions(message_id)`,
  `CREATE INDEX IF NOT EXISTS idx_group_reads_message ON group_message_reads(message_id)`,
  `CREATE INDEX IF NOT EXISTS idx_group_reads_user ON group_message_reads(username)`,
  `CREATE INDEX IF NOT EXISTS idx_channel_members_channel ON channel_members(channel_id)`,
  `CREATE INDEX IF NOT EXISTS idx_channel_messages_channel ON channel_messages(channel_id)`,
  `CREATE INDEX IF NOT EXISTS idx_channel_messages_ts ON channel_messages(timestamp DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_saved_messages_ts ON saved_messages(timestamp DESC)`,
];