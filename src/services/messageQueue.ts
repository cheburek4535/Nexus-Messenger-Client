import { sendMessageToServer } from './api';
import { wsManager } from './websocket';
import { sendMessage as saveMessage, updateMessageStatus } from './messageService';
import { encryptForRecipient } from '../crypto/secureChannel';

interface QueuedMessage {
  chatId: string;
  toUser: string;
  contentText: string;
  retries: number;
}

class MessageQueue {
  private queue: QueuedMessage[] = [];
  private processing = false;

  async enqueue(chatId: string, toUser: string, contentText: string) {
    this.queue.push({ chatId, toUser, contentText, retries: 0 });
    this.processQueue();
  }

  private async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    const item = this.queue[0];
    const identity = await import('./identity').then(m => m.getLocalIdentity());
    if (!identity) {
      this.processing = false;
      return;
    }

    // Сохраняем в локальную БД со статусом sending
    const message = await saveMessage({
      chatId: item.chatId,
      senderUsername: identity.username,
      contentText: item.contentText,
    });

    try {
      // Шифруем перед отправкой
      const { ciphertext, nonce } = await encryptForRecipient(item.contentText, item.toUser);

      const result = await sendMessageToServer(
        identity.username,
        item.toUser,
        ciphertext,
        { nonce }
      );

      // Обновляем статус на sent
      await updateMessageStatus(message.id, 'sent');

      // Удаляем из очереди
      this.queue.shift();
    } catch (e) {
      console.error('Failed to send message:', e);
      item.retries++;

      if (item.retries >= 3) {
        await updateMessageStatus(message.id, 'failed');
        this.queue.shift();
      }
    }

    this.processing = false;
    if (this.queue.length > 0) {
      setTimeout(() => this.processQueue(), 500);
    }
  }
}

export const messageQueue = new MessageQueue();