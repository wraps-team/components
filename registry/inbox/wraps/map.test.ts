import { describe, expect, it } from "vitest";
import { groupIntoThreads } from "../thread";
import { toMessage, type WrapsInboxEmail } from "./map";
import { applyReadState, emptyState, patchThread, reduceAction } from "./state";

const email = (over: Partial<WrapsInboxEmail> = {}): WrapsInboxEmail => ({
  emailId: "e1",
  messageId: "<a@x>",
  from: { address: "sam@example.com", name: "Sam" },
  to: [{ address: "me@example.com", name: "" }],
  cc: [],
  subject: "Hello",
  date: "2026-10-10T12:00:00.000Z",
  html: null,
  text: "hi",
  headers: {},
  attachments: [],
  receivedAt: "2026-10-10T12:00:01.000Z",
  ...over,
});

describe("toMessage", () => {
  it("maps addresses, dropping empty names", () => {
    const m = toMessage(email());
    expect(m.from).toEqual({ address: "sam@example.com", name: "Sam" });
    expect(m.to).toEqual([{ address: "me@example.com", name: undefined }]);
    expect(m).toMatchObject({
      id: "e1",
      direction: "inbound",
      messageId: "<a@x>",
    });
  });

  it("reads threading headers as string, array, or parsed object", () => {
    const m = toMessage(
      email({
        headers: {
          "in-reply-to": "<p@x>",
          references: ["<r1@x> <r2@x>", "<p@x>"],
        },
      }),
    );
    expect(m.inReplyTo).toBe("<p@x>");
    expect(m.references).toEqual(["<r1@x>", "<r2@x>", "<p@x>"]);
    expect(
      toMessage(email({ headers: { references: { text: "<r@x>" } } }))
        .references,
    ).toEqual(["<r@x>"]);
    expect(toMessage(email()).inReplyTo).toBeNull();
  });

  it("marks cid attachments inline, strips brackets, and attaches resolved urls", () => {
    const m = toMessage(
      email({
        attachments: [
          {
            id: "a1",
            filename: "l.png",
            contentType: "image/png",
            size: 5,
            cid: "<logo>",
          },
          {
            id: "a2",
            filename: "f.pdf",
            contentType: "application/pdf",
            size: 9,
            contentDisposition: "attachment",
          },
        ],
      }),
      { a1: "https://s3/x", a2: "/api/inbox?attachment=e1:a2" },
    );
    expect(m.attachments[0]).toMatchObject({
      cid: "logo",
      inline: true,
      url: "https://s3/x",
    });
    expect(m.attachments[1]).toMatchObject({
      inline: false,
      url: "/api/inbox?attachment=e1:a2",
    });
  });

  it("threads a reply to its parent end to end", () => {
    const a = toMessage(email());
    const b = toMessage(
      email({
        emailId: "e2",
        messageId: "<b@x>",
        subject: "Re: Hello",
        date: "2026-10-11T12:00:00.000Z",
        headers: { "in-reply-to": "<a@x>" },
      }),
    );
    expect(groupIntoThreads([a, b])).toHaveLength(1);
  });
});

describe("local state", () => {
  const baseline = "2026-10-10T00:00:00.000Z";
  const old = toMessage(
    email({ emailId: "old", date: "2026-10-09T00:00:00.000Z" }),
  );
  const fresh = toMessage(
    email({
      emailId: "new",
      messageId: "<n@x>",
      date: "2026-10-11T00:00:00.000Z",
      headers: { "in-reply-to": "<a@x>" },
    }),
  );

  it("treats mail from before the baseline as read and later mail as unread", () => {
    const [o, f] = applyReadState([old, fresh], emptyState(baseline));
    expect([o?.read, f?.read]).toEqual([true, false]);
  });

  it("applies overrides in both directions", () => {
    const state = {
      ...emptyState(baseline),
      overrides: { old: "unread" as const, new: "read" as const },
    };
    const [o, f] = applyReadState([old, fresh], state);
    expect([o?.read, f?.read]).toEqual([false, true]);
  });

  it("reduces actions without mutating the previous state", () => {
    const [thread] = groupIntoThreads(
      applyReadState([old, fresh], emptyState(baseline)),
    );
    const start = emptyState(baseline);
    const read = reduceAction(
      start,
      thread as NonNullable<typeof thread>,
      "read",
    );
    expect(read.overrides).toMatchObject({ old: "read", new: "read" });
    expect(start.overrides).toEqual({});
    const unread = reduceAction(
      read,
      thread as NonNullable<typeof thread>,
      "unread",
    );
    expect(unread.overrides.new).toBe("unread");
    const archived = reduceAction(
      start,
      thread as NonNullable<typeof thread>,
      "archive",
    );
    expect(archived.threads[(thread as NonNullable<typeof thread>).id]).toEqual(
      { archived: true },
    );
    expect(patchThread(archived, "x", { starred: true }).threads.x).toEqual({
      starred: true,
    });
  });
});
