import type { SQLiteDatabase } from 'expo-sqlite';

export async function seedDefaultSettings(db: SQLiteDatabase): Promise<void> {
  try {
    const defaults: Array<{ key: string; value: string }> = [
      { key: 'theme', value: 'system' },
      { key: 'default_auto_delete', value: '0' },
      { key: 'notifications_enabled', value: 'true' },
      { key: 'message_preview', value: 'false' },
    ];

    const now = Date.now();

    for (const setting of defaults) {
      await db.runAsync(
        `INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)`,
        [setting.key, setting.value, now]
      );
    }
    
    console.log('Default settings seeded');
  } catch (error) {
    console.error('Error seeding default settings:', error);
  }
}