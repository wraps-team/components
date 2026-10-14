/**
 * Backend-agnostic inbox types. Adapters map their provider's shapes onto
 * these (e.g. Wraps `InboxEmail` -> `Message`, grouped into `Thread`s by
 * `In-Reply-To` / `References`).
 */

export interface Address {
  address: string;
  name?: string;
}

export interface Attachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  /** Content-ID without angle brackets, for inline `cid:` images. */
  cid?: string | null;
  inline?: boolean;
  /** Resolved URL (download link, or data:/blob: for inline images). */
  url?: string;
}

export interface Message {
  id: string;
  threadId: string;
  direction: "inbound" | "outbound";
  from: Address;
  to: Address[];
  cc?: Address[];
  subject: string;
  /** ISO 8601. */
  date: string;
  html?: string | null;
  text?: string | null;
  attachments: Attachment[];
}

export interface Thread {
  id: string;
  subject: string;
  participants: Address[];
  snippet: string;
  /** ISO 8601 of the newest message. */
  lastMessageAt: string;
  unread: boolean;
  starred?: boolean;
  messages: Message[];
}

export interface Draft {
  to: string;
  cc?: string;
  subject: string;
  body: string;
  /** Set when replying, so the adapter can thread via In-Reply-To. */
  inReplyToMessageId?: string;
  threadId?: string;
}
