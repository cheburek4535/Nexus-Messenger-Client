import { getLocalIdentity, getAuthToken } from './identity';
import { saveIncomingMessage, updateMessageStatus } from './messageService';
import { createOrGetChat } from './chatService';
import { AppState } from 'react-native';
import { showLocalNotification } from './notifications';
import { getSettings } from './settingsService';
import { saveIncomingGroupMessage, updateGroupMessageStatus } from './groupMessageService';
import { saveIncomingChannelMessage, updateChannelMessageStatus } from './channelMessageService';

type MessageCallback = (message: {
  messageId: string;
  fromUser: string;
  toUser: string;
  ciphertext: string;
  nonce: string;
  timestamp: number;
  contentType?: string;
  contentUri?: string;
  mediaMimeType?: string;
  replyToId?: string;
  replyToText?: string;
}) => void;

type StatusCallback = (connected: boolean) => void;

class WebSocketManager {
  private ws: WebSocket | null = null;
  private messageCallbacks: MessageCallback[] = [];
  private statusCallbacks: StatusCallback[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts: number = 0;
  private username: string = '';
  private isConnecting: boolean = false;
  private shouldReconnect: boolean = true;
  private pingInterval: ReturnType<typeof setTimeout> | null = null;
  private globalUnsubscribe: (() => void) | null = null;
  private readReceiptCallbacks: ((messageId: string) => void)[] = [];
  private deliveredCallbacks: ((messageId: string) => void)[] = [];
  private systemCallbacks: Map<string, ((data: any) => void)[]> = new Map();
  private reactionCallbacks: ((data: { messageId: string; fromUser: string; reaction: string }) => void)[] = [];
  private groupReadCallbacks: ((data: { groupId: string; messageId: string; fromUser: string }) => void)[] = [];
  private callCallbacks: ((data: any) => void)[] = [];
  private messageQueue: any[] = [];

  onCallMessage(callback: (data: any) => void) {
    this.callCallbacks.push(callback);
    return () => {
      this.callCallbacks = this.callCallbacks.filter(cb => cb !== callback);
    };
  }

  sendReaction(messageId: string, reaction: string, toUser: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'reaction', message_id: messageId, from_user: this.username, to_user: toUser, content_text: reaction }));
  }

  onReaction(callback: (data: { messageId: string; fromUser: string; reaction: string }) => void) {
    this.reactionCallbacks.push(callback);
    return () => {
      this.reactionCallbacks = this.reactionCallbacks.filter(cb => cb !== callback);
    };
  }

  sendReadReceipt(messageId: string, fromUser?: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'read', message_id: messageId, from_user: fromUser }));
  }

  sendGroupReadReceipt(groupId: string, messageId: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'group_read', group_id: groupId, message_id: messageId, from_user: this.username }));
  }

  onGroupRead(callback: (data: { groupId: string; messageId: string; fromUser: string }) => void) {
    this.groupReadCallbacks.push(callback);
    return () => {
      this.groupReadCallbacks = this.groupReadCallbacks.filter(cb => cb !== callback);
    };
  }

  async connect(): Promise<void> {
    if (this.isConnecting || this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    const identity = await getLocalIdentity();
    if (!identity) return;

    const { registerOnServer, getCachedServerUrl } = await import('./api');
    try {
      const result = await registerOnServer();
      if (!result.success) {
        this.reconnectAttempts++;
        console.warn('Registration returned error:', result.error);
        this.scheduleReconnect();
        return;
      }
    } catch (e) {
      console.warn('Registration failed:', e);
      this.reconnectAttempts++;
      this.scheduleReconnect();
      return;
    }

    const authToken = await getAuthToken();
    if (!authToken) {
      console.warn('No auth token after registration, will retry');
      this.reconnectAttempts++;
      this.scheduleReconnect();
      return;
    }

    this.reconnectAttempts = 0;
    this.username = identity.username;
    this.isConnecting = true;
    this.shouldReconnect = true;

    try {
      const cached = getCachedServerUrl();
      if (!cached) {
        console.warn('No cached server URL, will retry');
        this.reconnectAttempts++;
        this.scheduleReconnect();
        return;
      }
      const wsUrl = `${cached.ws}/ws?token=${encodeURIComponent(authToken)}`;
      console.log(`🔌 Connecting WebSocket as ${identity.username}`);

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('✅ WebSocket connected as', this.username);
        this.isConnecting = false;
        this.notifyStatus(true);

        // Flush queued messages
        const queue = this.messageQueue.slice();
        this.messageQueue = [];
        for (const msg of queue) {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(msg));
          }
        }

        this.pingInterval = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000);
      };

      this.ws.onmessage = (event) => {
        try {
          const rawData = JSON.parse(event.data);
          
          if (rawData.type === 'pong' || rawData.type === 'ping') return;

          if (rawData.type === 'invitation' || rawData.type === 'invitation_response' ||
      rawData.type === 'ghost_message' || rawData.type === 'group_message' || rawData.type === 'channel_message' ||
      rawData.type === 'channel_subscribed' || rawData.type === 'group_member_added' ||
      rawData.type === 'group_left' || rawData.type === 'member_removed' ||
      rawData.type === 'channel_left' || rawData.type === 'subscriber_removed') {

    const doAfterSave = () => {
      (this.systemCallbacks.get(rawData.type) || []).forEach(cb => cb(rawData));

      if (rawData.type === 'group_message' && rawData.content_type !== 'reaction' && rawData.sender_username !== this.username) {
        this.scheduleLocalNotification('group', rawData);
      } else if (rawData.type === 'channel_message' && rawData.content_type !== 'reaction') {
        this.scheduleLocalNotification('channel', rawData);
      }
    };

    if (rawData.type === 'group_message' && rawData.content_type !== 'reaction' && rawData.content_type !== 'system') {
      this.handleIncomingGroupMessage(rawData).then(doAfterSave).catch(e => console.error('handleIncomingGroupMessage error:', e));
    } else if (rawData.type === 'channel_message' && rawData.content_type !== 'reaction' && rawData.content_type !== 'system') {
      this.handleIncomingChannelMessage(rawData).then(doAfterSave).catch(e => console.error('handleIncomingChannelMessage error:', e));
    } else if (rawData.type === 'invitation') {
      this.scheduleLocalNotification('invitation', rawData);
    } else {
      doAfterSave();
    } 

    return;
  }

          if (rawData.type === 'delivered') {
            const msgId = rawData.message_id || rawData.messageId;
            if (msgId) {
              this.deliveredCallbacks.forEach(cb => cb(msgId));
            }
            return;
          }

          if (rawData.type === 'read') {
            const msgId = rawData.message_id || rawData.messageId;
            if (msgId) {
              this.readReceiptCallbacks.forEach(cb => cb(msgId));
            }
            return;
          }

          if (rawData.type === 'reaction') {
            const data = {
              messageId: rawData.message_id || rawData.messageId,
              fromUser: rawData.from_user || rawData.fromUser || '',
              reaction: rawData.content_text || '',
            };
            if (data.messageId && data.reaction) {
              this.reactionCallbacks.forEach(cb => cb(data));
            }
            return;
          }

          if (rawData.type === 'group_read') {
            const groupReadData = {
              groupId: rawData.group_id || rawData.groupId || '',
              messageId: rawData.message_id || rawData.messageId || '',
              fromUser: rawData.from_user || rawData.fromUser || '',
            };
            if (groupReadData.messageId && groupReadData.groupId && groupReadData.fromUser) {
              this.groupReadCallbacks.forEach(cb => cb(groupReadData));
            }
            return;
          }

          // Call-related messages
          if (rawData.type === 'call_initiate' || rawData.type === 'call_accept' ||
              rawData.type === 'call_reject' || rawData.type === 'call_end' ||
              rawData.type === 'call_audio' || rawData.type === 'call_busy' ||
              rawData.type === 'call_offline' || rawData.type === 'call_ringing' ||
              rawData.type === 'webrtc_offer' || rawData.type === 'webrtc_answer' ||
              rawData.type === 'webrtc_ice') {
            this.callCallbacks.forEach(cb => cb(rawData));
            return;
          }
          
          const data = {
            messageId: rawData.messageId || rawData.message_id,
            fromUser: rawData.fromUser || rawData.from_user,
            toUser: rawData.toUser || rawData.to_user,
            ciphertext: rawData.ciphertext || '',
            nonce: rawData.nonce || '',
            timestamp: rawData.timestamp || Date.now(),
            contentType: rawData.contentType || rawData.content_type || undefined,
            contentUri: rawData.contentUri || rawData.content_uri || undefined,
            mediaMimeType: rawData.mediaMimeType || rawData.media_mime_type || undefined,
            replyToId: rawData.replyToId || rawData.reply_to_id || undefined,
            replyToText: rawData.replyToText || rawData.reply_to_text || undefined,
          };

          if (data.messageId && data.fromUser && data.toUser) {
            console.log('📨 WS message:', data.fromUser, '->', data.toUser);
            
            this.handleIncomingMessage(data).then(() => {
              if (data.fromUser !== this.username) {
                this.scheduleLocalNotification('dm', data);
              }
              
              this.sendAck(data.messageId);
              
              this.messageCallbacks.forEach(cb => {
                try { cb(data); } catch (e) { console.error('Callback error:', e); }
              });
            });
          }
        } catch (e) {
          console.error('Parse error:', e);
        }
      };

      this.ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        this.isConnecting = false;
      };

      this.ws.onclose = (event) => {
        console.log(`WebSocket closed: code=${event.code}`);
        this.isConnecting = false;
        this.notifyStatus(false);

        if (this.pingInterval) {
          clearInterval(this.pingInterval);
          this.pingInterval = null;
        }

        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      };
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  private async handleIncomingMessage(data: {
    messageId: string;
    fromUser: string;
    toUser: string;
    ciphertext: string;
    nonce?: string;
    timestamp: number;
    contentType?: string;
    contentUri?: string;
    mediaMimeType?: string;
    replyToId?: string;
    replyToText?: string;
  }) {
    try {
      const identity = await getLocalIdentity();
      if (!identity) return;

      if (data.toUser === identity.username) {
        let contentText = data.ciphertext;
        if (data.nonce) {
          try {
            const { decryptFromSender } = await import('../crypto/secureChannel');
            contentText = await decryptFromSender(data.ciphertext, data.nonce, data.fromUser);
          } catch (e) {
            console.error('Decrypt failed:', e);
          }
        }

        const chat = await createOrGetChat(data.fromUser, false);
        
        await saveIncomingMessage(
          chat.id,
          data.fromUser,
          contentText,
          {
            messageId: data.messageId,
            timestamp: data.timestamp,
            contentType: (data.contentType as any) || undefined,
            contentUri: data.contentUri,
            mediaMimeType: data.mediaMimeType,
            replyToId: data.replyToId,
            replyToText: data.replyToText,
            forwardedFrom: (data as any).forwardedFrom,
          }
        );
        console.log('💾 Saved incoming message to DB');
      }
      
      if (data.fromUser === identity.username) {
        await updateMessageStatus(data.messageId, 'delivered');
      }
    } catch (e) {
      console.error('Failed to handle incoming message:', e);
    }
  }

  private async handleIncomingGroupMessage(data: any): Promise<void> {
    try {
      const ts = typeof data.timestamp === 'string' ? new Date(data.timestamp).getTime() : (data.timestamp || Date.now());
      await saveIncomingGroupMessage(
        data.group_id,
        data.sender_username || data.from_user || '',
        data.content_text || '',
        {
          messageId: data.message_id,
          timestamp: ts,
          contentType: data.content_type,
          contentUri: data.content_uri,
          mediaMimeType: data.media_mime_type,
          replyToId: data.reply_to_id,
          replyToText: data.reply_to_text,
          forwardedFrom: data.forwarded_from,
          isSystem: data.is_system === true || data.is_system === 1,
        }
      );
      console.log('💾 Saved incoming group message to DB:', data.group_id, data.message_id);
    } catch (e) {
      console.error('handleIncomingGroupMessage error:', e);
      throw e;
    }
  }

  private async handleIncomingChannelMessage(data: any): Promise<void> {
    try {
      const ts = typeof data.timestamp === 'string' ? new Date(data.timestamp).getTime() : (data.timestamp || Date.now());
      await saveIncomingChannelMessage(
        data.group_id,
        data.sender_username || data.from_user || '',
        data.content_text || '',
        {
          messageId: data.message_id,
          timestamp: ts,
          contentType: data.content_type,
          contentUri: data.content_uri,
          mediaMimeType: data.media_mime_type,
          replyToId: data.reply_to_id,
          replyToText: data.reply_to_text,
          forwardedFrom: data.forwarded_from,
          isSystem: data.is_system === true || data.is_system === 1,
        }
      );
      console.log('💾 Saved incoming channel message to DB:', data.group_id, data.message_id);

      if ((data.sender_username || data.from_user) !== this.username) {
        this.scheduleLocalNotification('channel', data);
      }

      (this.systemCallbacks.get('channel_message') || []).forEach(cb => cb(data));
    } catch (e) {
      console.error('handleIncomingChannelMessage error:', e);
    }
  }

  private async scheduleLocalNotification(type: string, data: any): Promise<void> {
    if (AppState.currentState !== 'background' && AppState.currentState !== 'inactive') return;
    try {
      const settings = await getSettings();
      if (!settings.notificationsEnabled) return;
      if ((type === 'group' || type === 'channel') && !settings.notificationGroup) return;

      let title = '';
      let body = '';
      const contentText = data.content_text || '';
      const sender = data.sender_username || data.from_user || data.fromUser || '';
      const contentType = data.content_type || data.contentType || '';
      const preview = settings.notificationPreview
        ? (contentText.substring(0, 120) || (contentType && contentType !== 'text' ? `[${contentType}]` : 'New message'))
        : 'New message';

      if (type === 'dm') {
        title = `@${sender}`;
        body = preview;
        showLocalNotification({ title, body, data: { type: 'dm', target: sender } });
      } else if (type === 'group') {
        let groupName = sender;
        try {
          const { getGroupById } = await import('./groupService');
          const group = await getGroupById(data.group_id);
          if (group) groupName = group.name;
        } catch {}
        title = sender ? `@${sender} in ${groupName}` : groupName;
        body = preview;
        showLocalNotification({ title, body, data: { type: 'group', target: data.group_id } });
      } else if (type === 'channel') {
        let channelName = 'Channel';
        try {
          const { getChannelById } = await import('./channelService');
          const channel = await getChannelById(data.group_id);
          if (channel) channelName = channel.name;
        } catch {}
        title = sender ? `@${sender} in ${channelName}` : channelName;
        body = preview;
        showLocalNotification({ title, body, data: { type: 'channel', target: data.group_id } });
      } else if (type === 'invitation') {
        title = 'Ghost Invitation';
        body = `@${sender} sent you a ghost invitation`;
        showLocalNotification({ title, body, data: { type: 'dm', target: sender } });
      }
    } catch {}
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || !this.shouldReconnect) return;
    const delay = Math.min(3000 * Math.pow(1.5, this.reconnectAttempts), 30000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  sendAck(messageId: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'ack', message_id: messageId }));
  }

  sendMessage(data: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      this.messageQueue.push(data);
    }
  }

  onMessage(callback: MessageCallback) {
    this.messageCallbacks.push(callback);
    return () => {
      this.messageCallbacks = this.messageCallbacks.filter(cb => cb !== callback);
    };
  }

  onSystemMessage(type: string, callback: (data: any) => void) {
    if (!this.systemCallbacks.has(type)) {
      this.systemCallbacks.set(type, []);
    }
    this.systemCallbacks.get(type)!.push(callback);
    return () => {
      const arr = this.systemCallbacks.get(type) || [];
      this.systemCallbacks.set(type, arr.filter(cb => cb !== callback));
    };
  }

  onStatusChange(callback: StatusCallback) {
    this.statusCallbacks.push(callback);
    return () => {
      this.statusCallbacks = this.statusCallbacks.filter(cb => cb !== callback);
    };
  }

  onReadReceipt(callback: (messageId: string) => void) {
    this.readReceiptCallbacks.push(callback);
    return () => {
      this.readReceiptCallbacks = this.readReceiptCallbacks.filter(cb => cb !== callback);
    };
  }

  onDelivered(callback: (messageId: string) => void) {
    this.deliveredCallbacks.push(callback);
    return () => {
      this.deliveredCallbacks = this.deliveredCallbacks.filter(cb => cb !== callback);
    };
  }

  private notifyStatus(connected: boolean) {
    this.statusCallbacks.forEach(cb => cb(connected));
  }

  disconnect() {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  getUsername() {
    return this.username;
  }
}

export const wsManager = new WebSocketManager();