import { SCHEMA_VERSION, CREATE_TABLES, CREATE_INDEXES } from './schema';
import { getDatabase } from './connection';

export async function runMigrations(): Promise<void> {
  try {
    const db = await getDatabase();

    // Проверяем существование таблицы settings
    const settingsExists = await db.getFirstAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='settings'`
    );

    if (!settingsExists) {
      console.log('First run - creating all tables');
      
      // Создаём все таблицы
      for (const sql of CREATE_TABLES) {
        try {
          await db.execAsync(sql);
        } catch (error) {
          console.error('Error creating table:', error);
        }
      }

      // Создаём индексы
      for (const sql of CREATE_INDEXES) {
        try {
          await db.execAsync(sql);
        } catch (error) {
          console.error('Error creating index:', error);
        }
      }

      // Устанавливаем версию схемы
      await db.runAsync(
        `INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('schema_version', ?, ?)`,
        [SCHEMA_VERSION.toString(), Date.now()]
      );

      console.log('Database initialized with version', SCHEMA_VERSION);
      return;
    }

    // Проверяем версию
    const versionRow = await db.getFirstAsync<{ value: string }>(
      `SELECT value FROM settings WHERE key = 'schema_version'`
    );

    const currentVersion = versionRow ? parseInt(versionRow.value, 10) : 0;
    console.log(`Current DB version: ${currentVersion}, target: ${SCHEMA_VERSION}`);

    if (currentVersion < SCHEMA_VERSION) {
      console.log('Running migrations...');

      // Version 3 -> 4: add status column to group_messages + group_message_reads table
      if (currentVersion < 4) {
        await addColumnIfMissing(db, 'group_messages', 'status', "TEXT DEFAULT 'sent'");
      }
      
      // Version 6 -> 7: add status column to channel_messages
      if (currentVersion < 7) {
        await addColumnIfMissing(db, 'channel_messages', 'status', "TEXT DEFAULT 'sent'");
      }

      // Version 7 -> 8: add last_message_text and last_message_time to groups_data
      if (currentVersion < 8) {
        await addColumnIfMissing(db, 'groups_data', 'last_message_text', 'TEXT');
        await addColumnIfMissing(db, 'groups_data', 'last_message_time', 'INTEGER');
      }

      // Создаём недостающие таблицы
      for (const sql of CREATE_TABLES) {
        try {
          await db.execAsync(sql);
        } catch (error) {
          console.error('Error in migration:', error);
        }
      }

      // Обновляем индексы
      for (const sql of CREATE_INDEXES) {
        try {
          await db.execAsync(sql);
        } catch (error) {
          console.error('Error creating index:', error);
        }
      }

      // Обновляем версию
      await db.runAsync(
        `INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('schema_version', ?, ?)`,
        [SCHEMA_VERSION.toString(), Date.now()]
      );

      console.log('Migration completed');
    }
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

async function addColumnIfMissing(db: any, tableName: string, columnName: string, columnType: string): Promise<void> {
  try {
    const cols = await db.getAllAsync(`PRAGMA table_info(${tableName})`);
    const colNames = cols.map((c: any) => c.name);
    if (!colNames.includes(columnName)) {
      await db.execAsync(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`);
      console.log(`Added ${columnName} column to ${tableName}`);
    } else {
      console.log(`Column ${columnName} already exists in ${tableName}`);
    }
  } catch (error) {
    console.error(`Error adding ${columnName} to ${tableName}:`, error);
    throw error;
  }
}

// Полный сброс базы данных — удаляет все таблицы и создаёт заново
export async function resetDatabase(): Promise<void> {
  try {
    const db = await getDatabase();
    
    // Получаем список всех таблиц
    const tables = await db.getAllAsync<any>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
    );
    
    // Отключаем внешние ключи
    await db.execAsync('PRAGMA foreign_keys = OFF');
    
    // Удаляем все таблицы
    for (const table of tables) {
      try {
        await db.execAsync(`DROP TABLE IF EXISTS ${table.name}`);
        console.log(`Dropped table: ${table.name}`);
      } catch (error) {
        console.error(`Error dropping table ${table.name}:`, error);
      }
    }
    
    // Включаем внешние ключи
    await db.execAsync('PRAGMA foreign_keys = ON');
    
    // Создаём все таблицы заново
    for (const sql of CREATE_TABLES) {
      try {
        await db.execAsync(sql);
      } catch (error) {
        console.error('Error creating table:', error);
      }
    }

    // Создаём индексы
    for (const sql of CREATE_INDEXES) {
      try {
        await db.execAsync(sql);
      } catch (error) {
        console.error('Error creating index:', error);
      }
    }

    // Устанавливаем версию схемы
    await db.runAsync(
      `INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('schema_version', ?, ?)`,
      [SCHEMA_VERSION.toString(), Date.now()]
    );

    console.log('Database reset completed with version', SCHEMA_VERSION);
  } catch (error) {
    console.error('Database reset failed:', error);
    throw error;
  }
}