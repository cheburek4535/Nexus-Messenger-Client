import { encryptMessage, decryptMessage } from './e2e';
import { getContact, upsertContact } from '../services/contactService';
import { searchUser } from '../services/api';
import { getLocalIdentity } from '../services/identity';

// Get own public key from local identity
async function getMyPublicKey(): Promise<string | null> {
  const identity = await getLocalIdentity();
  return identity?.publicKey || null;
}

// Look up a user's public key (local contacts first, then server)
async function getRecipientPublicKey(username: string): Promise<string | null> {
  const contact = await getContact(username);
  if (contact?.publicKey) {
    return contact.publicKey;
  }
  const result = await searchUser(username);
  if (result.found && result.publicKey) {
    await upsertContact(username, { publicKey: result.publicKey });
    return result.publicKey;
  }
  return null;
}

// Encrypt a plaintext message for a recipient and return { ciphertext, nonce }
export async function encryptForRecipient(
  plaintext: string,
  recipientUsername: string
): Promise<{ ciphertext: string; nonce: string }> {
  const myPubKey = await getMyPublicKey();
  if (!myPubKey) {
    throw new Error('No local public key');
  }
  const theirPubKey = await getRecipientPublicKey(recipientUsername);
  if (!theirPubKey) {
    throw new Error(`No public key found for ${recipientUsername}`);
  }
  return await encryptMessage(plaintext, myPubKey, theirPubKey);
}

// Decrypt a message from a sender (local contacts first, then server fallback)
export async function decryptFromSender(
  ciphertext: string,
  nonce: string,
  senderUsername: string
): Promise<string> {
  const myPubKey = await getMyPublicKey();
  if (!myPubKey) {
    console.warn('No local public key for decryption');
    return ciphertext;
  }

  let senderPubKey: string | null | undefined;

  const contact = await getContact(senderUsername);
  senderPubKey = contact?.publicKey;

  if (!senderPubKey) {
    console.log(`No local contact for ${senderUsername}, fetching from server...`);
    const result = await searchUser(senderUsername);
    if (result.found && result.publicKey) {
      senderPubKey = result.publicKey;
      await upsertContact(senderUsername, { publicKey: senderPubKey });
      console.log(`Fetched and cached public key for ${senderUsername}`);
    }
  }

  if (!senderPubKey) {
    console.error(`Cannot decrypt: no public key found for ${senderUsername}`);
    // Don't return ciphertext - return a clear error marker so UI can show it's encrypted
    return `[ENCRYPTED: missing key for ${senderUsername}]`;
  }
  try {
    return await decryptMessage(ciphertext, nonce, myPubKey, senderPubKey);
  } catch (e) {
    console.error(`Decryption failed for ${senderUsername}:`, e);
    return `[ENCRYPTED: decrypt failed for ${senderUsername}]`;
  }
}