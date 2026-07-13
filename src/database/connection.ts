import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';
import { CREATE_TABLES, SCHEMA_VERSION } from './schema';

let db: SQLite.SQLiteDatabase | null = null;
let isInitialized = false;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db && isInitialized) return db;

  if (Platform.OS === 'web') {
    console.warn('SQLite is not available on web platform');
    throw new Error('Database not available on web');
  }

  try {
    // Открываем базу данных
    db = await SQLite.openDatabaseAsync('nexus_messenger.db');
    
    // Включаем WAL режим и внешние ключи
    await db.execAsync('PRAGMA journal_mode = WAL');
    await db.execAsync('PRAGMA foreign_keys = ON');

    // Проверяем существование таблицы settings
    const tableExists = await checkTableExists(db, 'settings');
    
    if (!tableExists) {
      console.log('Creating tables for the first time...');
      await createAllTables(db);
      await setSchemaVersion(db, SCHEMA_VERSION);
    } else {
      // Проверяем версию схемы
      const version = await getSchemaVersion(db);
      console.log(`Current schema version: ${version}`);
      
      if (version < SCHEMA_VERSION) {
        console.log(`Upgrading schema from v${version} to v${SCHEMA_VERSION}`);
        await migrateSchema(db, version, SCHEMA_VERSION);
        await setSchemaVersion(db, SCHEMA_VERSION);
      }
    }

    // ВСЕГДА проверяем и добавляем колонки (на случай, если миграция не сработала)
    await ensureColumns(db);

    isInitialized = true;
    console.log('Database initialized successfully');
    return db;
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
}

async function checkTableExists(db: SQLite.SQLiteDatabase, tableName: string): Promise<boolean> {
  try {
    const result = await db.getFirstAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
      [tableName]
    );
    return result !== null;
  } catch (error) {
    console.error(`Error checking table ${tableName}:`, error);
    return false;
  }
}

async function createAllTables(db: SQLite.SQLiteDatabase): Promise<void> {
  for (const sql of CREATE_TABLES) {
    try {
      await db.execAsync(sql);
      console.log('Executed SQL:', sql.substring(0, 50) + '...');
    } catch (error) {
      console.error('Error executing SQL:', sql.substring(0, 50), error);
      // Продолжаем выполнение даже при ошибке
    }
  }
}

async function getSchemaVersion(db: SQLite.SQLiteDatabase): Promise<number> {
  try {
    const result = await db.getFirstAsync<{ value: string }>(
      `SELECT value FROM settings WHERE key = 'schema_version'`
    );
    return result ? parseInt(result.value, 10) : 0;
  } catch (error) {
    console.error('Error getting schema version:', error);
    return 0;
  }
}

async function setSchemaVersion(db: SQLite.SQLiteDatabase, version: number): Promise<void> {
  try {
    await db.runAsync(
      `INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('schema_version', ?, ?)`,
      [version.toString(), Date.now()]
    );
  } catch (error) {
    console.error('Error setting schema version:', error);
  }
}

async function migrateSchema(db: SQLite.SQLiteDatabase, fromVersion: number, toVersion: number): Promise<void> {
  for (let v = fromVersion + 1; v <= toVersion; v++) {
    switch (v) {
      case 2:
        await addColumnIfNotExists(db, 'messages', 'reply_to_text', 'TEXT');
        await addColumnIfNotExists(db, 'messages', 'media_mime_type', 'TEXT');
        break;
      case 4:
        await addColumnIfNotExists(db, 'group_messages', 'status', 'TEXT DEFAULT \'sent\'');
        break;
      case 5:
        await addColumnIfNotExists(db, 'messages', 'forwarded_from', 'TEXT');
        await addColumnIfNotExists(db, 'group_messages', 'forwarded_from', 'TEXT');
        await addColumnIfNotExists(db, 'channel_messages', 'forwarded_from', 'TEXT');
        break;
      case 6:
        await addColumnIfNotExists(db, 'messages', 'reply_to_username', 'TEXT');
        await addColumnIfNotExists(db, 'group_messages', 'reply_to_username', 'TEXT');
        await addColumnIfNotExists(db, 'channel_messages', 'reply_to_username', 'TEXT');
        break;
    }
  }
}

async function addColumnIfNotExists(
  db: SQLite.SQLiteDatabase,
  table: string,
  column: string,
  colType: string
): Promise<void> {
  try {
    await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${colType}`);
    console.log(`Added column ${column} to ${table}`);
  } catch (_e) {
    // Column already exists — ignore
  }
}

async function ensureColumns(db: SQLite.SQLiteDatabase): Promise<void> {
  await addColumnIfNotExists(db, 'messages', 'reply_to_text', 'TEXT');
  await addColumnIfNotExists(db, 'messages', 'reply_to_username', 'TEXT');
  await addColumnIfNotExists(db, 'messages', 'media_mime_type', 'TEXT');
  await addColumnIfNotExists(db, 'messages', 'forwarded_from', 'TEXT');
  await addColumnIfNotExists(db, 'group_messages', 'reply_to_username', 'TEXT');
  await addColumnIfNotExists(db, 'group_messages', 'forwarded_from', 'TEXT');
  await addColumnIfNotExists(db, 'channel_messages', 'reply_to_username', 'TEXT');
  await addColumnIfNotExists(db, 'channel_messages', 'forwarded_from', 'TEXT');
  // Ensure blocked_users table exists for all DB versions
  try {
    await db.execAsync(
      `CREATE TABLE IF NOT EXISTS blocked_users (
        username TEXT PRIMARY KEY NOT NULL,
        blocked_at INTEGER NOT NULL
      )`
    );
  } catch (_e) {}
  // Ensure group tables exist for all DB versions
  try {
    await db.execAsync(
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
        admin_usernames TEXT
      )`
    );
  } catch (_e) {}
  try { await db.execAsync(`ALTER TABLE groups_data ADD COLUMN is_channel INTEGER DEFAULT 0`); } catch (_e) {}
  try { await db.execAsync(`ALTER TABLE groups_data ADD COLUMN owner_username TEXT`); } catch (_e) {}
  try { await db.execAsync(`ALTER TABLE groups_data ADD COLUMN admin_usernames TEXT`); } catch (_e) {}
  try {
    await db.execAsync(
      `CREATE TABLE IF NOT EXISTS group_members (
        group_id TEXT NOT NULL,
        username TEXT NOT NULL,
        joined_at INTEGER NOT NULL,
        PRIMARY KEY (group_id, username),
        FOREIGN KEY (group_id) REFERENCES groups_data(id) ON DELETE CASCADE
      )`
    );
  } catch (_e) {}
  try {
    await db.execAsync(
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
        timestamp INTEGER NOT NULL,
        status TEXT DEFAULT 'sent',
        is_system INTEGER DEFAULT 0,
        is_deleted INTEGER DEFAULT 0,
        forwarded_from TEXT,
        FOREIGN KEY (group_id) REFERENCES groups_data(id) ON DELETE CASCADE
      )`
    );
  } catch (_e) {}
  try { await db.execAsync(`ALTER TABLE group_messages ADD COLUMN media_mime_type TEXT`); } catch (_e) {}
  try { await db.execAsync(`ALTER TABLE group_messages ADD COLUMN reply_to_id TEXT`); } catch (_e) {}
  try { await db.execAsync(`ALTER TABLE group_messages ADD COLUMN reply_to_text TEXT`); } catch (_e) {}
  try { await db.execAsync(`ALTER TABLE group_messages ADD COLUMN status TEXT DEFAULT 'sent'`); } catch (_e) {}
  try {
    await db.execAsync(
      `CREATE TABLE IF NOT EXISTS message_reactions (
        message_id TEXT NOT NULL,
        username TEXT NOT NULL,
        reaction TEXT NOT NULL,
        chat_id TEXT,
        group_id TEXT,
        timestamp INTEGER NOT NULL,
        PRIMARY KEY (message_id, username)
      )`
    );
  } catch (_e) {}
  try {
    await db.execAsync(
      `CREATE TABLE IF NOT EXISTS group_message_reads (
        message_id TEXT NOT NULL,
        username TEXT NOT NULL,
        read_at INTEGER NOT NULL,
        PRIMARY KEY (message_id, username),
        FOREIGN KEY (message_id) REFERENCES group_messages(id) ON DELETE CASCADE
      )`
    );
  } catch (_e) {}
  // Ensure saved_messages table exists
  try {
    await db.execAsync(
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
      )`
    );
  } catch (_e) {}
  try { await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_saved_messages_ts ON saved_messages(timestamp DESC)`); } catch (_e) {}

  // Ensure channel tables exist
  try {
    await db.execAsync(
      `CREATE TABLE IF NOT EXISTS channels_data (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        avatar_uri TEXT,
        owner_username TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`
    );
  } catch (_e) {}
  try {
    await db.execAsync(
      `CREATE TABLE IF NOT EXISTS channel_members (
        channel_id TEXT NOT NULL,
        username TEXT NOT NULL,
        joined_at INTEGER NOT NULL,
        PRIMARY KEY (channel_id, username),
        FOREIGN KEY (channel_id) REFERENCES channels_data(id) ON DELETE CASCADE
      )`
    );
  } catch (_e) {}
  try {
    await db.execAsync(
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
        timestamp INTEGER NOT NULL,
        is_system INTEGER DEFAULT 0,
        is_deleted INTEGER DEFAULT 0,
        forwarded_from TEXT,
        FOREIGN KEY (channel_id) REFERENCES channels_data(id) ON DELETE CASCADE
      )`
    );
  } catch (_e) {}
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    try {
      await db.closeAsync();
      db = null;
      isInitialized = false;
      console.log('Database closed');
    } catch (error) {
      console.error('Error closing database:', error);
    }
  }
}

// Функция для пересоздания базы данных (для отладки)
export async function resetDatabase(): Promise<void> {
  try {
    if (db) {
      await db.closeAsync();
      db = null;
    }
    
    await SQLite.deleteDatabaseAsync('nexus_messenger.db');
    db = await SQLite.openDatabaseAsync('nexus_messenger.db');
    await db.execAsync('PRAGMA journal_mode = WAL');
    await db.execAsync('PRAGMA foreign_keys = ON');
    await createAllTables(db);
    isInitialized = true;
    console.log('Database reset and recreated');
  } catch (error) {
    console.error('Error resetting database:', error);
    throw error;
  }
}

export async function clearAllData(): Promise<void> {
  const db = await getDatabase();
  
  // Удаляем все данные из таблиц
  await db.execAsync('DELETE FROM messages');
  await db.execAsync('DELETE FROM drafts');
  await db.execAsync('DELETE FROM chats');
  await db.execAsync('DELETE FROM contacts');
  await db.execAsync('DELETE FROM message_reactions');
  await db.execAsync('DELETE FROM group_messages');
  await db.execAsync('DELETE FROM group_members');
  await db.execAsync('DELETE FROM groups_data');
  await db.execAsync('DELETE FROM channel_messages');
  await db.execAsync('DELETE FROM channel_members');
  await db.execAsync('DELETE FROM channels_data');
  await db.execAsync('DELETE FROM saved_messages');
  
  // Сбрасываем настройки до дефолтных
  await db.execAsync('DELETE FROM settings');
  
  console.log('All data cleared from database');
}