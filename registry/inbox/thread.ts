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

/** Plain-text preview of a message's new text (quoted history excluded). Output is text; render it as text. */
export function snippetOf(message: Message, max = 140): string {
  let source: string;
  if (message.text != null) {
    source = splitQuoted(message.text).body;
  } else {
    let html = message.html ?? "";
    const at = html.search(QUOTE_HTML_MARKERS);
    if (at > 0) html = html.slice(0, html.lastIndexOf("<", at));
    source = html
      .replace(/<(style|script)\b[\s\S]*?<\/\1\s*>/gi, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&");
  }
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
      labels: persisted?.labels ?? [],
      snoozedUntil: persisted?.snoozedUntil ?? null,
      messages: sorted.map((m) => ({ ...m, threadId: id })),
    });
  }
  return threads.sort(
    (a, b) => Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt),
  );
}

export function isSnoozed(thread: Thread, now: Date): boolean {
  return (
    Boolean(thread.snoozedUntil) &&
    Date.parse(thread.snoozedUntil as string) > now.getTime()
  );
}

/**
 * Threads for a folder. Snoozed threads leave the inbox until `snoozedUntil`
 * passes; `now` defaults to the current time.
 */
export function filterThreads(
  threads: Thread[],
  folder: Folder,
  now: Date = new Date(),
): Thread[] {
  switch (folder) {
    case "inbox":
      return threads.filter((t) => !t.archived && !isSnoozed(t, now));
    case "starred":
      return threads.filter((t) => t.starred);
    case "snoozed":
      return threads.filter((t) => !t.archived && isSnoozed(t, now));
    case "archived":
      return threads.filter((t) => t.archived);
  }
}

export function countUnread(
  threads: Thread[],
  folder: Folder,
  now: Date = new Date(),
): number {
  return filterThreads(threads, folder, now).filter((t) => t.unread).length;
}

/** Every label in use, sorted. */
export function labelsOf(threads: Thread[]): string[] {
  return [...new Set(threads.flatMap((t) => t.labels ?? []))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export interface SnoozePreset {
  id: "later" | "tomorrow" | "weekend" | "next-week";
  label: string;
  until: Date;
}

/**
 * Snooze choices relative to `now`, in the viewer's local time: later today
 * (+3h, only before 6pm), tomorrow 8am, this weekend (Saturday 8am), next
 * week (Monday 8am).
 */
export function snoozePresets(now: Date): SnoozePreset[] {
  const at8 = (daysAhead: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + daysAhead);
    d.setHours(8, 0, 0, 0);
    return d;
  };
  const presets: SnoozePreset[] = [];
  if (now.getHours() < 18) {
    presets.push({
      id: "later",
      label: "Later today",
      until: new Date(now.getTime() + 3 * 60 * 60 * 1000),
    });
  }
  presets.push({ id: "tomorrow", label: "Tomorrow", until: at8(1) });
  const day = now.getDay(); // 0 Sun … 6 Sat
  const toSaturday = day === 6 ? 7 : (6 - day + 7) % 7;
  presets.push({
    id: "weekend",
    label: "This weekend",
    until: at8(toSaturday),
  });
  const toMonday = (1 - day + 7) % 7 || 7;
  presets.push({ id: "next-week", label: "Next week", until: at8(toMonday) });
  return presets;
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

export interface QuotedSplit {
  /** The new text of the message. */
  body: string;
  /** The quoted history below it ('' when there is none). */
  quoted: string;
}

/**
 * Split a plain-text message into its new text and the quoted reply history.
 * Recognizes "On … wrote:", "-----Original Message-----", Outlook-style
 * From/Sent headers, and trailing `>` blocks. If nothing precedes the marker
 * (e.g. a pure forward) the whole message is kept as the body.
 */
export function splitQuoted(text: string): QuotedSplit {
  const lines = text.split(/\r?\n/);
  const markers: number[] = [];

  lines.forEach((line, i) => {
    const next = lines[i + 1] ?? "";
    if (/^-{2,}\s*(original message|forwarded message)\s*-{2,}\s*$/i.test(line))
      markers.push(i);
    else if (/^on\s.{4,200}wrote:\s*$/i.test(line)) markers.push(i);
    else if (/^on\s.{4,200}$/i.test(line) && /wrote:\s*$/i.test(next))
      markers.push(i);
    else if (
      /^from:\s/i.test(line) &&
      lines.slice(i + 1, i + 5).some((l) => /^(sent|date):\s/i.test(l))
    )
      markers.push(i);
  });

  // A trailing run of ">" lines (blank lines allowed between them).
  let end = lines.length;
  while (end > 0 && lines[end - 1]?.trim() === "") end -= 1;
  let start = end;
  while (
    start > 0 &&
    (lines[start - 1]?.trim() === "" || lines[start - 1]?.startsWith(">"))
  )
    start -= 1;
  while (start < end && !lines[start]?.startsWith(">")) start += 1;
  if (start < end) markers.push(start);

  const at = markers.length ? Math.min(...markers) : -1;
  if (at < 0) return { body: text, quoted: "" };
  const body = lines.slice(0, at).join("\n").trimEnd();
  if (!body.trim()) return { body: text, quoted: "" };
  return { body, quoted: lines.slice(at).join("\n").trim() };
}

const QUOTE_HTML_MARKERS =
  /class\s*=\s*["'][^"']*\b(gmail_quote|yahoo_quoted|moz-cite-prefix)\b|<blockquote\b[^>]*type\s*=\s*["']?cite|id\s*=\s*["'](divRplyFwdMsg|appendonsend)["']/i;

/** True when an HTML message contains quoted reply history we know how to hide. */
export function hasQuotedHtml(html: string): boolean {
  return QUOTE_HTML_MARKERS.test(html);
}

export interface ParsedQuery {
  /** Free text; every term must appear in the subject, people or message text. */
  terms: string[];
  /** Terms (or phrases) that must not appear. */
  excluded: string[];
  from: string[];
  to: string[];
  subject: string[];
  label: string[];
  is: string[];
  has: string[];
  /** Epoch ms; threads whose newest message is before / on-or-after. */
  before?: number;
  after?: number;
}

function tokenize(query: string): string[] {
  const tokens: string[] = [];
  const re = /(-?[a-z]+:)?(?:"([^"]*)"|(\S+))/gi;
  for (const m of query.matchAll(re)) {
    const prefix = m[1] ?? "";
    const value = m[2] ?? m[3] ?? "";
    // Quoted phrases keep their quotes so they stay one term.
    tokens.push(
      m[2] !== undefined ? `${prefix}"${value}"` : `${prefix}${value}`,
    );
  }
  return tokens;
}

function parseDay(value: string): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return undefined;
  const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  return Number.isNaN(t) ? undefined : t;
}

/**
 * Parse a search query. Operators: `from:` `to:` `subject:` `label:`
 * `is:unread|read|starred|archived|snoozed` `has:attachment`
 * `before:YYYY-MM-DD` `after:YYYY-MM-DD`; `"quoted phrases"`; a leading `-`
 * excludes a term. Unknown `key:value` pairs are treated as plain text.
 */
export function parseQuery(query: string): ParsedQuery {
  const out: ParsedQuery = {
    terms: [],
    excluded: [],
    from: [],
    to: [],
    subject: [],
    label: [],
    is: [],
    has: [],
  };
  const strip = (v: string) => v.replace(/^"|"$/g, "").toLowerCase();
  for (const token of tokenize(query)) {
    const negated = token.startsWith("-") && token.length > 1;
    const body = negated ? token.slice(1) : token;
    const op = /^([a-z]+):(.*)$/i.exec(body);
    const key = op?.[1]?.toLowerCase();
    const value = strip(op?.[2] ?? "");
    if (key && value) {
      switch (key) {
        case "from":
        case "to":
        case "subject":
        case "label":
        case "is":
        case "has":
          if (!negated) out[key].push(value);
          else out.excluded.push(value);
          continue;
        case "before": {
          const t = parseDay(value);
          if (t !== undefined && !negated) out.before = t;
          continue;
        }
        case "after": {
          const t = parseDay(value);
          if (t !== undefined && !negated) out.after = t;
          continue;
        }
      }
    }
    const term = strip(body);
    if (!term) continue;
    (negated ? out.excluded : out.terms).push(term);
  }
  return out;
}

function personText(a: { address: string; name?: string }): string {
  return `${a.name ?? ""} ${a.address}`.toLowerCase();
}

function bodyText(m: Message): string {
  return (
    m.text ??
    (m.html ?? "")
      .replace(/<(style|script)\b[\s\S]*?<\/\1\s*>/gi, " ")
      .replace(/<[^>]*>/g, " ")
  ).toLowerCase();
}

/**
 * Filter threads by a query (see `parseQuery`). All conditions must match;
 * an empty query returns every thread. Order is preserved.
 */
export function searchThreads(
  threads: Thread[],
  query: string,
  now: Date = new Date(),
): Thread[] {
  const q = parseQuery(query);
  const unconstrained =
    !q.terms.length &&
    !q.excluded.length &&
    !q.from.length &&
    !q.to.length &&
    !q.subject.length &&
    !q.label.length &&
    !q.is.length &&
    !q.has.length &&
    q.before === undefined &&
    q.after === undefined;
  if (unconstrained) return threads;

  return threads.filter((t) => {
    const last = Date.parse(t.lastMessageAt);
    if (q.before !== undefined && !(last < q.before)) return false;
    if (q.after !== undefined && !(last >= q.after)) return false;

    for (const flag of q.is) {
      const ok =
        (flag === "unread" && t.unread) ||
        (flag === "read" && !t.unread) ||
        (flag === "starred" && t.starred) ||
        (flag === "archived" && t.archived) ||
        (flag === "snoozed" && isSnoozed(t, now));
      if (!ok) return false;
    }
    if (
      q.has.some(
        (h) =>
          h !== "attachment" ||
          !t.messages.some((m) => m.attachments.some((a) => !a.inline)),
      )
    )
      return false;

    const labels = (t.labels ?? []).map((l) => l.toLowerCase());
    if (q.label.some((l) => !labels.includes(l))) return false;

    const subject = t.subject.toLowerCase();
    if (q.subject.some((s) => !subject.includes(s))) return false;

    const senders = t.messages.map((m) => personText(m.from));
    if (q.from.some((f) => !senders.some((s) => s.includes(f)))) return false;
    const recipients = t.messages.flatMap((m) =>
      [...m.to, ...(m.cc ?? [])].map(personText),
    );
    if (q.to.some((r) => !recipients.some((s) => s.includes(r)))) return false;

    if (q.terms.length || q.excluded.length) {
      const haystack = [
        subject,
        ...t.participants.map(personText),
        ...(t.labels ?? []),
        ...t.messages.map(bodyText),
      ].join("\n");
      if (q.terms.some((term) => !haystack.includes(term))) return false;
      if (q.excluded.some((term) => haystack.includes(term))) return false;
    }
    return true;
  });
}
