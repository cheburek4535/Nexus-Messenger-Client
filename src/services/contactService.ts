import { getDatabase } from '../database/connection';

export interface Contact {
  username: string;
  publicKey: string | null;
  displayName: string | null;
  avatarUri: string | null;
  lastSeen: number | null;
  createdAt: number;
}

export async function upsertContact(username: string, data: {
  publicKey?: string;
  displayName?: string;
  avatarUri?: string;
  lastSeen?: number;
}): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();

  const existing = await db.getFirstAsync<any>(
    `SELECT * FROM contacts WHERE username = ?`, [username]
  );

  if (existing) {
    await db.runAsync(
      `UPDATE contacts SET
        public_key = COALESCE(?, public_key),
        display_name = COALESCE(?, display_name),
        avatar_uri = COALESCE(?, avatar_uri),
        last_seen = COALESCE(?, last_seen)
      WHERE username = ?`,
      [
        data.publicKey ?? null,
        data.displayName ?? null,
        data.avatarUri ?? null,
        data.lastSeen ?? null,
        username
      ]
    );
  } else {
    await db.runAsync(
      `INSERT INTO contacts (username, public_key, display_name, avatar_uri, last_seen, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        username,
        data.publicKey ?? null,
        data.displayName ?? null,
        data.avatarUri ?? null,
        data.lastSeen ?? null,
        now
      ]
    );
  }
}

export async function getContact(username: string): Promise<Contact | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<any>(
    `SELECT * FROM contacts WHERE username = ?`, [username]
  );
  if (!row) return null;
  return {
    username: row.username,
    publicKey: row.public_key,
    displayName: row.display_name,
    avatarUri: row.avatar_uri,
    lastSeen: row.last_seen,
    createdAt: row.created_at,
  };
}

export async function syncChatsWithContacts(): Promise<void> {
  const db = await getDatabase();
  // Update all chats where contact has display_name or avatar_uri
  await db.execAsync(
    `UPDATE chats SET
      display_name = (SELECT display_name FROM contacts WHERE contacts.username = chats.username),
      avatar_uri = (SELECT avatar_uri FROM contacts WHERE contacts.username = chats.username)
    WHERE EXISTS (SELECT 1 FROM contacts WHERE contacts.username = chats.username)`
  );
}
