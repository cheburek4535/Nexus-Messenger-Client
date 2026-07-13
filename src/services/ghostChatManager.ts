import { wsManager } from './websocket';
import { getLocalIdentity } from './identity';
import { Message } from './messageService';
import { getDatabase } from '../database/connection';

export interface GhostInvitation {
  id: string;
  fromUser: string;
  toUser: string;
  snapshotsAllowed: boolean;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: number;
}

export interface GhostChatInfo {
  username: string;
  snapshotsAllowed: boolean;
  createdAt: number;
  lastActivity: number;
}

type InvitationCallback = (inv: GhostInvitation) => void;
type GhostMessageCallback = (data: {
  fromUser: string;
  toUser: string;
  messageId: string;
  ciphertext: string;
  nonce: string;
  timestamp: number;
  contentType?: string;
  contentUri?: string;
  mediaMimeType?: string;
  replyToId?: string;
  replyToText?: string;
  replyToUsername?: string;
}) => void;

const GHOST_SESSION_KEY = 'ghost_active_sessions';

class GhostChatManager {
  private invitations: Map<string, GhostInvitation> = new Map();
  private listeners: Map<string, InvitationCallback[]> = new Map();
  private ghostMessageListeners: Map<string, GhostMessageCallback[]> = new Map();
  public currentUser: string = '';
  private ghostMessages: Map<string, Message[]> = new Map();
  private activeGhostChats: Map<string, GhostChatInfo> = new Map();
  private wsUnsubscribes: (() => void)[] = [];
  private initialized: boolean = false;
  private sentInvitations: Map<string, number> = new Map(); // toUser -> createdAt

  async init() {
    if (this.initialized) return;
    this.initialized = true;

    const identity = await getLocalIdentity();
    this.currentUser = identity?.username || '';

    this.restoreSession();

    const unsubInv = wsManager.onSystemMessage('invitation', (data: any) => {
      const inv: GhostInvitation = {
        id: data.invitation_id || data.invitationId,
        fromUser: data.from_user || data.fromUser,
        toUser: data.to_user || data.toUser,
        snapshotsAllowed: data.snapshots_allowed ?? data.snapshotsAllowed ?? true,
        status: 'pending',
        createdAt: data.timestamp || Date.now(),
      };
      this.invitations.set(inv.id, inv);
      this.notify('invitation', inv);
    });
    this.wsUnsubscribes.push(unsubInv);

    const unsubResp = wsManager.onSystemMessage('invitation_response', (data: any) => {
      const invId = data.invitation_id || data.invitationId;
      const inv = this.invitations.get(invId);
      const responderSnapshots = data.snapshots_allowed ?? data.snapshotsAllowed ?? true;
      if (inv) {
        inv.status = data.accepted ? 'accepted' : 'declined';
        if (data.accepted) {
          const responder = data.from_user || data.fromUser;
          const chatInfo = this.activeGhostChats.get(responder);
          if (chatInfo) {
            chatInfo.snapshotsAllowed = chatInfo.snapshotsAllowed && responderSnapshots;
          }
        }
        this.notify('response', inv);
      } else {
        const responder = data.from_user || data.fromUser;
        const initiator = data.to_user || data.toUser;
        const newInv: GhostInvitation = {
          id: invId,
          fromUser: responder,
          toUser: initiator,
          snapshotsAllowed: responderSnapshots,
          status: data.accepted ? 'accepted' : 'declined',
          createdAt: data.timestamp || Date.now(),
        };
        this.invitations.set(invId, newInv);
        if (data.accepted) {
          const chatInfo = this.activeGhostChats.get(responder);
          if (chatInfo) {
            chatInfo.snapshotsAllowed = chatInfo.snapshotsAllowed && responderSnapshots;
            this.saveSession();
          }
        }
        this.notify('response', newInv);
      }
    });
    this.wsUnsubscribes.push(unsubResp);

    const unsubGhostMsg = wsManager.onSystemMessage('ghost_message', (data: any) => {
      const fromKey = data.from_user || data.fromUser;
      const toKey = data.to_user || data.toUser;
      const msgData = {
        fromUser: fromKey,
        toUser: toKey,
        messageId: data.message_id || data.messageId,
        ciphertext: data.ciphertext || '',
        nonce: data.nonce || '',
        timestamp: data.timestamp || Date.now(),
        contentType: data.content_type || data.contentType,
        contentUri: data.content_uri || data.contentUri,
        mediaMimeType: data.media_mime_type || data.mediaMimeType,
        replyToId: data.reply_to_id || data.replyToId,
        replyToText: data.reply_to_text || data.replyToText,
      };
      if (fromKey && this.ghostMessageListeners.has(fromKey)) {
        this.ghostMessageListeners.get(fromKey)!.forEach(cb => cb(msgData));
      }
      this.notifyGhostMessage(fromKey, msgData);
    });
    this.wsUnsubscribes.push(unsubGhostMsg);
  }

  destroy() {
    this.wsUnsubscribes.forEach(fn => fn());
    this.wsUnsubscribes = [];
  }

  sendInvitation(toUser: string, snapshotsAllowed: boolean) {
    this.sentInvitations.set(toUser, Date.now());
    wsManager.sendMessage({
      type: 'invitation',
      from_user: this.currentUser,
      to_user: toUser,
      snapshots_allowed: snapshotsAllowed,
    });
  }

  getInvitationCreatedAt(toUser: string): number | undefined {
    return this.sentInvitations.get(toUser);
  }

  respondToInvitation(invitationId: string, accepted: boolean, snapshotsAllowed: boolean) {
    wsManager.sendMessage({
      type: 'invitation_response',
      invitation_id: invitationId,
      from_user: this.currentUser,
      accepted,
      snapshots_allowed: snapshotsAllowed,
    });
  }

  getPendingInvitations(): GhostInvitation[] {
    return Array.from(this.invitations.values()).filter(
      (inv) => inv.toUser === this.currentUser && inv.status === 'pending'
    );
  }

  on(event: 'invitation' | 'response', callback: InvitationCallback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
    return () => {
      const arr = this.listeners.get(event) || [];
      this.listeners.set(event, arr.filter(cb => cb !== callback));
    };
  }

  onGhostMessage(username: string, callback: GhostMessageCallback) {
    if (!this.ghostMessageListeners.has(username)) {
      this.ghostMessageListeners.set(username, []);
    }
    this.ghostMessageListeners.get(username)!.push(callback);
    return () => {
      const arr = this.ghostMessageListeners.get(username) || [];
      this.ghostMessageListeners.set(username, arr.filter(cb => cb !== callback));
    };
  }

  private notifyGhostMessage(fromUser: string, data: Parameters<GhostMessageCallback>[0]) {
    const listeners = this.ghostMessageListeners.get(fromUser) || [];
    listeners.forEach(cb => cb(data));
  }

  // === Ghost Chat Session Management ===

  startGhostChat(username: string, snapshotsAllowed: boolean) {
    const existing = this.activeGhostChats.get(username);
    this.activeGhostChats.set(username, {
      username,
      snapshotsAllowed,
      createdAt: existing?.createdAt || Date.now(),
      lastActivity: Date.now(),
    });
    this.saveSession();
  }

  addGhostChat(username: string, snapshotsAllowed: boolean) {
    if (!this.activeGhostChats.has(username)) {
      this.activeGhostChats.set(username, {
        username,
        snapshotsAllowed,
        createdAt: Date.now(),
        lastActivity: Date.now(),
      });
      this.saveSession();
    }
  }

  removeGhostChat(username: string) {
    this.activeGhostChats.delete(username);
    this.ghostMessages.delete(username);
    this.saveSession();
  }

  getActiveGhostChats(): string[] {
    return Array.from(this.activeGhostChats.keys());
  }

  getGhostChatInfo(username: string): GhostChatInfo | undefined {
    return this.activeGhostChats.get(username);
  }

  hasActiveGhostChat(username: string): boolean {
    return this.activeGhostChats.has(username);
  }

  updateActivity(username: string) {
    const info = this.activeGhostChats.get(username);
    if (info) {
      info.lastActivity = Date.now();
      this.saveSession();
    }
  }

  // === Ghost Messages Storage ===

  saveGhostMessages(chatUsername: string, msgs: Message[]) {
    this.ghostMessages.set(chatUsername, msgs);
  }

  getGhostMessages(chatUsername: string): Message[] {
    return this.ghostMessages.get(chatUsername) || [];
  }

  addGhostMessage(chatUsername: string, msg: Message) {
    const msgs = this.ghostMessages.get(chatUsername) || [];
    msgs.push(msg);
    this.ghostMessages.set(chatUsername, msgs);
  }

  clearGhostChat(chatUsername: string) {
    this.ghostMessages.delete(chatUsername);
  }

  clearAllGhostChats() {
    this.ghostMessages.clear();
    this.activeGhostChats.clear();
    this.saveSession();
  }

  // === Session Persistence ===

  private async saveSession() {
    try {
      const db = await getDatabase();
      const sessions = Array.from(this.activeGhostChats.values());
      await db.runAsync(
        `INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)`,
        [GHOST_SESSION_KEY, JSON.stringify(sessions), Date.now()]
      );
    } catch (e) {
      console.error('Failed to save ghost session:', e);
    }
  }

  private async restoreSession() {
    try {
      const db = await getDatabase();
      const row = await db.getFirstAsync<any>(
        `SELECT value FROM settings WHERE key = ?`,
        [GHOST_SESSION_KEY]
      );
      if (row && row.value) {
        const sessions: GhostChatInfo[] = JSON.parse(row.value);
        this.activeGhostChats.clear();
        sessions.forEach(s => {
          this.activeGhostChats.set(s.username, s);
        });
      }
    } catch (e) {
      console.error('Failed to restore ghost session:', e);
    }
  }

  async endGhostChatOnAppBackground() {
    await this.saveSession();
  }

  async restoreGhostChatsOnAppForeground() {
    await this.restoreSession();
  }

  private notify(event: string, inv: GhostInvitation) {
    this.listeners.get(event)?.forEach(cb => cb(inv));
  }
}

export const ghostChatManager = new GhostChatManager();
