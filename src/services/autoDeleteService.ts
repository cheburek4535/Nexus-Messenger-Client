import { getDatabase } from '../database/connection';
import { getChatById } from './chatService';

export async function cleanupExpiredMessages(chatId: string): Promise<number> {
  const db = await getDatabase();
  const chat = await getChatById(chatId);
  
  if (!chat || chat.autoDeleteTimer === 0) return 0;

  const now = Date.now();
  const cutoff = now - chat.autoDeleteTimer;

  const result = await db.runAsync(
    `UPDATE messages SET is_deleted = 1 WHERE chat_id = ? AND timestamp < ? AND is_deleted = 0`,
    [chatId, cutoff]
  );

  return result.changes;
}

export async function runGlobalCleanup(): Promise<void> {
  const db = await getDatabase();
  const chats = await db.getAllAsync<any>(`SELECT id, auto_delete_timer FROM chats WHERE auto_delete_timer > 0`);
  
  for (const chat of chats) {
    const cutoff = Date.now() - chat.auto_delete_timer;
    await db.runAsync(
      `UPDATE messages SET is_deleted = 1 WHERE chat_id = ? AND timestamp < ? AND is_deleted = 0`,
      [chat.id, cutoff]
    );
  }
}

// Запускаем периодическую очистку
export function startAutoDeleteScheduler() {
  // Проверяем каждые 5 минут
  setInterval(() => {
    runGlobalCleanup();
  }, 5 * 60 * 1000);
  
  // И сразу при запуске
  runGlobalCleanup();
}