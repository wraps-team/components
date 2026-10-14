import type { Attachment, Message } from "../types";

/**
 * The subset of `@wraps.dev/email`'s `InboxEmail` this adapter reads. Declared
 * here so the mapper has no dependency on the SDK (and is trivially testable).
 */
export interface WrapsInboxEmail {
  emailId: string;
  messageId: string;
  from: { address: string; name: string };
  to: { address: string; name: string }[];
  cc: { address: string; name: string }[];
  subject: string;
  date: string;
  html: string | null;
  text: string | null;
  headers: Record<string, unknown>;
  attachments: {
    id: string;
    filename: string;
    contentType: string;
    size: number;
    contentDisposition?: "attachment" | "inline";
    cid?: string | null;
  }[];
  receivedAt: string;
}

function headerStrings(value: unknown): string[] {
  if (typeof value === "string") return value.split(/\s+/).filter(Boolean);
  if (Array.isArray(value)) return value.flatMap(headerStrings);
  if (value && typeof value === "object" && "text" in value)
    return headerStrings((value as { text: unknown }).text);
  return [];
}

const clean = (a: { address: string; name: string }) => ({
  address: a.address,
  name: a.name || undefined,
});

/**
 * Map a Wraps inbox email to a `Message`. `urls` maps attachment id to a
 * resolved URL (presigned for inline images, or a download route).
 */
export function toMessage(
  email: WrapsInboxEmail,
  urls: Record<string, string> = {},
): Message {
  const attachments: Attachment[] = email.attachments.map((a) => ({
    id: a.id,
    filename: a.filename,
    contentType: a.contentType,
    size: a.size,
    cid: a.cid ? a.cid.replace(/^<|>$/g, "") : null,
    inline: a.contentDisposition === "inline" || Boolean(a.cid),
    url: urls[a.id],
  }));
  return {
    id: email.emailId,
    threadId: "",
    direction: "inbound",
    from: clean(email.from),
    to: email.to.map(clean),
    cc: email.cc.map(clean),
    subject: email.subject,
    date: email.date || email.receivedAt,
    html: email.html,
    text: email.text,
    attachments,
    messageId: email.messageId,
    inReplyTo: headerStrings(email.headers["in-reply-to"])[0] ?? null,
    references: headerStrings(email.headers.references),
  };
}
