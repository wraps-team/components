import type { Folder, Message, Thread, ThreadState } from "./types";

/** "Re: [x] Fwd: Hello" -> "hello". */
export function normalizeSubject(subject: string): string {
  return subject
    .replace(/^\s*((re|fwd?|aw|sv|wg)(\[\d+\])?\s*:\s*)+/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function hasReplyPrefix(subject: string): boolean {
  return /^\s*(re|fwd?|aw|sv|wg)(\[\d+\])?\s*:/i.test(subject);
}

function normalizeId(id: string): string {
  return id.trim().replace(/^<|>$/g, "").toLowerCase();
}

/** Plain-text preview of a message body. Output is text; render it as text. */
export function snippetOf(message: Message, max = 140): string {
  const source =
    message.text ??
    (message.html ?? "")
      .replace(/<(style|script)\b[\s\S]*?<\/\1\s*>/gi, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&");
  const flat = source.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function addresses(m: Message): string[] {
  return [m.from, ...m.to, ...(m.cc ?? [])].map((a) => a.address.toLowerCase());
}

function hasLinks(m: Message): boolean {
  return Boolean(m.conversationId || m.inReplyTo || m.references?.length);
}

export interface GroupOptions {
  /** Persisted thread state, keyed by thread id. */
  state?: Record<string, ThreadState | undefined>;
  /** Max gap for the subject fallback. Default 30 days. */
  subjectWindowMs?: number;
}

/**
 * Group a flat list of messages into conversations.
 *
 * Messages join a thread when they share a `conversationId`, or a Message-ID
 * in any of Message-ID / In-Reply-To / References. As a fallback, a message
 * with no threading headers joins a thread with the same normalized subject,
 * a shared participant and a reply/forward prefix on either side, within
 * `subjectWindowMs`. Unrelated mail that merely shares a subject (receipts,
 * alerts) is never merged.
 *
 * Thread ids are the `conversationId` if any message has one, otherwise the
 * `id` of the earliest message — stable as replies arrive.
 */
export function groupIntoThreads(
  messages: Message[],
  options: GroupOptions = {},
): Thread[] {
  const { state = {}, subjectWindowMs = 30 * 24 * 60 * 60 * 1000 } = options;
  const parent = messages.map((_, i) => i);
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root] as number;
    let cur = i;
    while (parent[cur] !== root) {
      const next = parent[cur] as number;
      parent[cur] = root;
      cur = next;
    }
    return root;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };

  // Any shared key links two messages: a parent's own id is its reply's
  // In-Reply-To, and siblings share the ancestor ids in References.
  const keys = new Map<string, number>();
  const link = (key: string, i: number) => {
    const seen = keys.get(key);
    if (seen === undefined) keys.set(key, i);
    else union(i, seen);
  };
  messages.forEach((m, i) => {
    if (m.messageId) link(`m:${normalizeId(m.messageId)}`, i);
    if (m.inReplyTo) link(`m:${normalizeId(m.inReplyTo)}`, i);
    for (const ref of m.references ?? []) link(`m:${normalizeId(ref)}`, i);
    if (m.conversationId) link(`c:${m.conversationId}`, i);
  });

  const buckets = new Map<string, number[]>();
  messages.forEach((m, i) => {
    const subject = normalizeSubject(m.subject);
    if (!subject) return;
    const list = buckets.get(subject) ?? [];
    list.push(i);
    buckets.set(subject, list);
  });
  for (const indexes of buckets.values()) {
    for (const a of indexes) {
      for (const b of indexes) {
        if (b <= a || find(a) === find(b)) continue;
        const ma = messages[a] as Message;
        const mb = messages[b] as Message;
        if (hasLinks(ma) && hasLinks(mb)) continue;
        if (!hasReplyPrefix(ma.subject) && !hasReplyPrefix(mb.subject))
          continue;
        if (
          Math.abs(Date.parse(ma.date) - Date.parse(mb.date)) > subjectWindowMs
        )
          continue;
        const theirs = new Set(addresses(mb));
        if (!addresses(ma).some((x) => theirs.has(x))) continue;
        union(a, b);
      }
    }
  }

  const groups = new Map<number, Message[]>();
  messages.forEach((m, i) => {
    const root = find(i);
    const list = groups.get(root) ?? [];
    list.push(m);
    groups.set(root, list);
  });

  const threads: Thread[] = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort(
      (a, b) => Date.parse(a.date) - Date.parse(b.date),
    );
    const first = sorted[0] as Message;
    const last = sorted[sorted.length - 1] as Message;
    const id = sorted.find((m) => m.conversationId)?.conversationId ?? first.id;
    const seen = new Set<string>();
    const participants = sorted
      .flatMap((m) => [m.from, ...m.to, ...(m.cc ?? [])])
      .filter((a) => {
        const key = a.address.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    const persisted = state[id];
    threads.push({
      id,
      subject: first.subject.trim() || "(no subject)",
      participants,
      snippet: snippetOf(last),
      lastMessageAt: last.date,
      unread: sorted.some((m) => m.direction === "inbound" && m.read === false),
      starred: persisted?.starred ?? false,
      archived: persisted?.archived ?? false,
      messages: sorted.map((m) => ({ ...m, threadId: id })),
    });
  }
  return threads.sort(
    (a, b) => Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt),
  );
}

export function filterThreads(threads: Thread[], folder: Folder): Thread[] {
  switch (folder) {
    case "inbox":
      return threads.filter((t) => !t.archived);
    case "starred":
      return threads.filter((t) => t.starred);
    case "archived":
      return threads.filter((t) => t.archived);
  }
}

export function countUnread(threads: Thread[], folder: Folder): number {
  return filterThreads(threads, folder).filter((t) => t.unread).length;
}

export interface ThreadGroup {
  label: string;
  threads: Thread[];
}

/**
 * Bucket threads (already newest-first) into Today / Yesterday / Previous 7
 * days / Previous 30 days / Older, by the viewer's local calendar days.
 * Empty buckets are omitted and input order is preserved.
 */
export function groupByDate(threads: Thread[], now: Date): ThreadGroup[] {
  const day = 24 * 60 * 60 * 1000;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const start = today.getTime();
  const buckets: [string, number][] = [
    ["Today", start],
    ["Yesterday", start - day],
    ["Previous 7 days", start - 7 * day],
    ["Previous 30 days", start - 30 * day],
    ["Older", Number.NEGATIVE_INFINITY],
  ];
  const result: ThreadGroup[] = buckets.map(([label]) => ({
    label,
    threads: [],
  }));
  for (const thread of threads) {
    const t = Date.parse(thread.lastMessageAt);
    const index = buckets.findIndex(([, from]) => t >= from);
    (result[index] as ThreadGroup).threads.push(thread);
  }
  return result.filter((g) => g.threads.length > 0);
}
