import { describe, expect, it } from "vitest";
import {
  countUnread,
  filterThreads,
  groupByDate,
  groupIntoThreads,
  normalizeSubject,
  snippetOf,
} from "./thread";
import type { Message, Thread } from "./types";

let n = 0;
function msg(overrides: Partial<Message> = {}): Message {
  n += 1;
  return {
    id: `id${n}`,
    threadId: "",
    direction: "inbound",
    from: { address: "a@example.com" },
    to: [{ address: "me@example.com" }],
    subject: "Hello",
    date: new Date(Date.UTC(2026, 9, 1, 12, n)).toISOString(),
    attachments: [],
    text: "body",
    ...overrides,
  };
}

describe("normalizeSubject", () => {
  it("strips stacked reply/forward prefixes and case", () => {
    expect(normalizeSubject("RE: Fwd: re[2]:  Launch   plan ")).toBe(
      "launch plan",
    );
  });
});

describe("groupIntoThreads", () => {
  it("links a reply to its parent via In-Reply-To", () => {
    const a = msg({ messageId: "<a@x>" });
    const b = msg({ messageId: "<b@x>", inReplyTo: "<a@x>", subject: "Other" });
    const threads = groupIntoThreads([b, a]);
    expect(threads).toHaveLength(1);
    expect(threads[0]?.messages.map((m) => m.id)).toEqual([a.id, b.id]);
  });

  it("links siblings through a root that is not in the set", () => {
    const x = msg({
      inReplyTo: "<root@x>",
      references: ["<root@x>"],
      subject: "A",
    });
    const y = msg({
      inReplyTo: "<x@x>",
      references: ["<root@x>", "<x@x>"],
      subject: "B",
    });
    expect(groupIntoThreads([x, y])).toHaveLength(1);
  });

  it("is case- and bracket-insensitive for ids", () => {
    const a = msg({ messageId: "A@X", subject: "One" });
    const b = msg({ inReplyTo: "<a@x>", subject: "Two" });
    expect(groupIntoThreads([a, b])).toHaveLength(1);
  });

  it("uses conversationId and prefers it as the thread id", () => {
    const a = msg({ conversationId: "conv-1", subject: "One" });
    const b = msg({ conversationId: "conv-1", subject: "Two" });
    const [t, ...rest] = groupIntoThreads([a, b]);
    expect(rest).toHaveLength(0);
    expect(t?.id).toBe("conv-1");
    expect(t?.messages.every((m) => m.threadId === "conv-1")).toBe(true);
  });

  it("falls back to subject for header-less replies sharing a participant", () => {
    const a = msg({
      subject: "Launch plan",
      direction: "outbound",
      from: { address: "me@example.com" },
      to: [{ address: "sam@example.com" }],
    });
    const b = msg({
      subject: "Re: Launch plan",
      from: { address: "sam@example.com" },
      to: [{ address: "me@example.com" }],
    });
    expect(groupIntoThreads([a, b])).toHaveLength(1);
  });

  it("does not merge unrelated mail with the same subject (no reply prefix)", () => {
    const a = msg({ subject: "Your receipt" });
    const b = msg({ subject: "Your receipt" });
    expect(groupIntoThreads([a, b])).toHaveLength(2);
  });

  it("does not subject-merge across people or beyond the window", () => {
    const a = msg({ subject: "Plan" });
    const stranger = msg({
      subject: "Re: Plan",
      from: { address: "z@z.com" },
      to: [{ address: "q@q.com" }],
    });
    expect(groupIntoThreads([a, stranger])).toHaveLength(2);
    const late = msg({ subject: "Re: Plan", date: "2027-06-01T00:00:00.000Z" });
    expect(groupIntoThreads([a, late])).toHaveLength(2);
  });

  it("does not subject-merge when both messages carry their own thread headers", () => {
    const a = msg({ subject: "Plan", messageId: "<a@x>", inReplyTo: "<p1@x>" });
    const b = msg({
      subject: "Re: Plan",
      messageId: "<b@x>",
      inReplyTo: "<p2@x>",
    });
    expect(groupIntoThreads([a, b])).toHaveLength(2);
  });

  it("derives unread from inbound messages only, and takes persisted state", () => {
    const a = msg({ read: false, direction: "outbound", conversationId: "c" });
    const b = msg({ read: true, conversationId: "c" });
    expect(groupIntoThreads([a, b])[0]?.unread).toBe(false);
    const c = msg({ read: false, conversationId: "c" });
    const [t] = groupIntoThreads([a, b, c], {
      state: { c: { archived: true, starred: true } },
    });
    expect(t).toMatchObject({ unread: true, archived: true, starred: true });
  });

  it("orders threads newest first and builds participants and snippet", () => {
    const old = msg({ subject: "Old", date: "2026-01-01T00:00:00.000Z" });
    const fresh = msg({
      subject: "New",
      text: "latest words",
      from: { address: "B@example.com" },
      date: "2026-02-01T00:00:00.000Z",
    });
    const threads = groupIntoThreads([old, fresh]);
    expect(threads.map((t) => t.subject)).toEqual(["New", "Old"]);
    expect(threads[0]?.snippet).toBe("latest words");
    expect(threads[0]?.participants.map((p) => p.address)).toEqual([
      "B@example.com",
      "me@example.com",
    ]);
  });

  it("handles an empty list and a missing subject", () => {
    expect(groupIntoThreads([])).toEqual([]);
    expect(groupIntoThreads([msg({ subject: "  " })])[0]?.subject).toBe(
      "(no subject)",
    );
  });
});

describe("snippetOf", () => {
  it("strips html and truncates", () => {
    const m = msg({
      text: null,
      html: "<style>p{}</style><p>Hi&nbsp;<b>there</b></p>",
    });
    expect(snippetOf(m)).toBe("Hi there");
    expect(snippetOf(msg({ text: "x".repeat(300) })).length).toBe(140);
  });
});

function thread(over: Partial<Thread>): Thread {
  return {
    id: "t",
    subject: "s",
    participants: [],
    snippet: "",
    lastMessageAt: "2026-10-14T12:00:00.000Z",
    unread: false,
    messages: [],
    ...over,
  };
}

describe("folders", () => {
  const all = [
    thread({ id: "1", unread: true }),
    thread({ id: "2", archived: true, unread: true }),
    thread({ id: "3", starred: true }),
  ];
  it("filters and counts", () => {
    expect(filterThreads(all, "inbox").map((t) => t.id)).toEqual(["1", "3"]);
    expect(filterThreads(all, "archived").map((t) => t.id)).toEqual(["2"]);
    expect(filterThreads(all, "starred").map((t) => t.id)).toEqual(["3"]);
    expect(countUnread(all, "inbox")).toBe(1);
  });
});

describe("groupByDate", () => {
  it("buckets by local calendar day and omits empty buckets", () => {
    const now = new Date(2026, 9, 14, 15, 0);
    const at = (d: number, h = 9) => new Date(2026, 9, d, h).toISOString();
    const groups = groupByDate(
      [
        thread({ id: "a", lastMessageAt: at(14) }),
        thread({ id: "b", lastMessageAt: at(13, 23) }),
        thread({ id: "c", lastMessageAt: at(9) }),
        thread({ id: "d", lastMessageAt: new Date(2026, 8, 20).toISOString() }),
        thread({ id: "e", lastMessageAt: new Date(2025, 0, 1).toISOString() }),
      ],
      now,
    );
    expect(groups.map((g) => [g.label, g.threads.map((t) => t.id)])).toEqual([
      ["Today", ["a"]],
      ["Yesterday", ["b"]],
      ["Previous 7 days", ["c"]],
      ["Previous 30 days", ["d"]],
      ["Older", ["e"]],
    ]);
  });
});
