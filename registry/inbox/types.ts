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
  /** RFC 5322 Message-ID, with or without angle brackets. */
  messageId?: string | null;
  /** Message-ID this message replies to. */
  inReplyTo?: string | null;
  /** Message-IDs of the thread's ancestors, oldest first. */
  references?: string[];
  /** Explicit thread key from your backend (e.g. a Wraps signed conversation id). Wins over header matching. */
  conversationId?: string | null;
  /** Inbound messages with `read: false` make their thread unread. Default read. */
  read?: boolean;
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
  archived?: boolean;
  messages: Message[];
}

/** Thread-level state your backend persists; passed to `groupIntoThreads`. */
export interface ThreadState {
  starred?: boolean;
  archived?: boolean;
}

export type ThreadAction =
  | "read"
  | "unread"
  | "archive"
  | "unarchive"
  | "star"
  | "unstar";

export type Folder = "inbox" | "starred" | "archived";

export interface Draft {
  to: string;
  cc?: string;
  subject: string;
  body: string;
  /** Set when replying, so the adapter can thread via In-Reply-To. */
  inReplyToMessageId?: string;
  threadId?: string;
}
