import type { Message } from "../types";
import { toMessage, type WrapsInboxEmail } from "./map";

/** The slice of `WrapsEmail["inbox"]` the handlers use. */
export interface InboxLike {
  list(options?: { maxResults?: number; continuationToken?: string }): Promise<{
    emails: { emailId: string }[];
    nextToken?: string;
  }>;
  get(emailId: string): Promise<WrapsInboxEmail>;
  getAttachment(
    emailId: string,
    attachmentId: string,
    options?: { expiresIn?: number },
  ): Promise<string>;
  reply(
    emailId: string,
    options: { from: string; text?: string },
  ): Promise<{ messageId: string }>;
}

/** The slice of `WrapsEmail` the handlers use. */
export interface WrapsLike {
  inbox: InboxLike | null;
  send(params: {
    from: string;
    to: string[];
    subject: string;
    text: string;
  }): Promise<{ messageId: string }>;
}

export interface InboxHandlerOptions {
  wraps: WrapsLike;
  /** Verified SES sender for replies and new messages. */
  from: string;
  /**
   * REQUIRED. Return true only for requests allowed to read and send as this
   * mailbox (check your session). Nothing is served without it.
   */
  authorize: (request: Request) => boolean | Promise<boolean>;
  /** Emails per page. Default 25, max 50. */
  pageSize?: number;
  /** Parallel S3 reads per page. Default 8. */
  concurrency?: number;
  /** Lifetime of presigned inline-image URLs. Default 900s. */
  attachmentTtlSeconds?: number;
}

const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

const MAX_BODY = 200_000;
const ADDRESS = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

async function pool<T, R>(
  items: T[],
  size: number,
  work: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: "fulfilled", value: await work(items[i] as T) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, run));
  return results;
}

/**
 * Request handlers for a Wraps inbox, usable as Next.js route handlers:
 * `export const { GET, POST } = createInboxHandlers({ … })`.
 *
 * - `GET ?cursor=&limit=` → `{ messages: Message[], nextToken?, failed }`
 * - `GET ?attachment=<emailId>:<attachmentId>` → 302 to a presigned URL
 * - `POST { to, cc?, subject, body, inReplyToMessageId? }` → replies (with
 *   threading headers) when `inReplyToMessageId` is set, otherwise sends new
 *
 * POST requires `Content-Type: application/json`, which browsers only send
 * cross-site after a preflight, so cross-site form posts are rejected.
 */
export function createInboxHandlers(options: InboxHandlerOptions) {
  const {
    wraps,
    from,
    authorize,
    concurrency = 8,
    attachmentTtlSeconds = 900,
  } = options;
  const pageSize = Math.min(Math.max(options.pageSize ?? 25, 1), 50);

  async function GET(request: Request): Promise<Response> {
    if (!(await authorize(request)))
      return json({ error: "Unauthorized" }, 401);
    const inbox = wraps.inbox;
    if (!inbox)
      return json({ error: "Inbox is not configured (inboxBucketName)" }, 501);

    const url = new URL(request.url);
    const attachment = url.searchParams.get("attachment");
    if (attachment) {
      const [emailId, attachmentId] = attachment.split(":");
      if (!emailId || !attachmentId)
        return json({ error: "Bad attachment" }, 400);
      try {
        const target = await inbox.getAttachment(emailId, attachmentId, {
          expiresIn: attachmentTtlSeconds,
        });
        return new Response(null, {
          status: 302,
          headers: { Location: target, "Cache-Control": "private, no-store" },
        });
      } catch {
        return json({ error: "Attachment not found" }, 404);
      }
    }

    const limit = Math.min(
      Math.max(Number(url.searchParams.get("limit")) || pageSize, 1),
      50,
    );
    const page = await inbox.list({
      maxResults: limit,
      continuationToken: url.searchParams.get("cursor") ?? undefined,
    });
    const base = url.pathname;
    const settled = await pool(
      page.emails,
      concurrency,
      async ({ emailId }) => {
        const email = await inbox.get(emailId);
        const urls: Record<string, string> = {};
        for (const a of email.attachments) {
          if (a.cid) {
            // Inline images render inside the sandboxed frame, so they need a
            // direct (presigned) URL.
            urls[a.id] = await inbox.getAttachment(emailId, a.id, {
              expiresIn: attachmentTtlSeconds,
            });
          } else {
            urls[a.id] =
              `${base}?attachment=${encodeURIComponent(`${emailId}:${a.id}`)}`;
          }
        }
        return toMessage(email, urls);
      },
    );
    const messages: Message[] = [];
    let failed = 0;
    for (const r of settled) {
      if (r.status === "fulfilled") messages.push(r.value);
      else failed += 1;
    }
    return json({ messages, nextToken: page.nextToken, failed });
  }

  async function POST(request: Request): Promise<Response> {
    if (!(await authorize(request)))
      return json({ error: "Unauthorized" }, 401);
    if (!request.headers.get("content-type")?.includes("application/json"))
      return json({ error: "Expected application/json" }, 415);
    const inbox = wraps.inbox;

    let draft: Record<string, unknown>;
    try {
      draft = (await request.json()) as Record<string, unknown>;
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    const body = typeof draft.body === "string" ? draft.body : "";
    const subject =
      typeof draft.subject === "string" ? draft.subject.trim() : "";
    const to = String(draft.to ?? "")
      .split(/[,;]/)
      .map((a) => a.trim())
      .filter(Boolean);
    if (!body.trim() || body.length > MAX_BODY)
      return json({ error: "Message body is empty or too long" }, 400);

    try {
      const replyTo =
        typeof draft.inReplyToMessageId === "string"
          ? draft.inReplyToMessageId
          : null;
      if (replyTo) {
        if (!inbox) return json({ error: "Inbox is not configured" }, 501);
        // reply() derives recipients and subject from the original message.
        const result = await inbox.reply(replyTo, { from, text: body });
        return json({ messageId: result.messageId });
      }
      if (!to.length || !to.every((a) => ADDRESS.test(a)))
        return json({ error: "Invalid recipient address" }, 400);
      if (!subject || /[\r\n]/.test(subject))
        return json({ error: "Invalid subject" }, 400);
      const result = await wraps.send({ from, to, subject, text: body });
      return json({ messageId: result.messageId });
    } catch (error) {
      return json(
        { error: error instanceof Error ? error.message : "Send failed" },
        502,
      );
    }
  }

  return { GET, POST };
}
