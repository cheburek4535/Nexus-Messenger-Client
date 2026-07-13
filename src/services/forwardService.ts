export interface ForwardMessage {
  id: string;
  senderUsername: string;
  contentType: string;
  contentText: string | null;
  contentUri: string | null;
  mediaMimeType: string | null;
  replyToId: string | null;
  replyToText: string | null;
  timestamp: number;
}

let pendingForward: ForwardMessage | null = null;

export function setPendingForward(msg: ForwardMessage): void {
  pendingForward = msg;
}

export function getPendingForward(): ForwardMessage | null {
  return pendingForward;
}

export function clearPendingForward(): void {
  pendingForward = null;
}
