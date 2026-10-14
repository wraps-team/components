import { describe, expect, it, vi } from "vitest";
import type { WrapsInboxEmail } from "./map";
import { createInboxHandlers, type InboxLike, type WrapsLike } from "./server";

const email = (
  id: string,
  over: Partial<WrapsInboxEmail> = {},
): WrapsInboxEmail => ({
  emailId: id,
  messageId: `<${id}@x>`,
  from: { address: "sam@example.com", name: "Sam" },
  to: [{ address: "me@example.com", name: "" }],
  cc: [],
  subject: `Subject ${id}`,
  date: "2026-10-10T12:00:00.000Z",
  html: null,
  text: "hi",
  headers: {},
  attachments: [],
  receivedAt: "2026-10-10T12:00:00.000Z",
  ...over,
});

function setup(
  over: { inbox?: Partial<InboxLike> | null; allow?: boolean } = {},
) {
  const inbox: InboxLike = {
    list: vi.fn(async () => ({
      emails: [{ emailId: "a" }, { emailId: "b" }],
      nextToken: "next",
    })),
    get: vi.fn(async (id: string) => email(id)),
    getAttachment: vi.fn(async () => "https://s3.example.com/signed"),
    reply: vi.fn(async () => ({ messageId: "reply-1" })),
    ...over.inbox,
  };
  const wraps: WrapsLike = {
    inbox: over.inbox === null ? null : inbox,
    send: vi.fn(async () => ({ messageId: "sent-1" })),
  };
  const handlers = createInboxHandlers({
    wraps,
    from: "me@example.com",
    authorize: () => over.allow ?? true,
  });
  return { inbox, wraps, ...handlers };
}

const get = (qs = "") => new Request(`https://app.test/api/inbox${qs}`);
const post = (body: unknown, type = "application/json") =>
  new Request("https://app.test/api/inbox", {
    method: "POST",
    headers: { "content-type": type },
    body: JSON.stringify(body),
  });

describe("authorization", () => {
  it("rejects every method before touching the inbox", async () => {
    const { GET, POST, inbox, wraps } = setup({ allow: false });
    expect((await GET(get())).status).toBe(401);
    expect(
      (await POST(post({ to: "a@b.co", subject: "s", body: "b" }))).status,
    ).toBe(401);
    expect(inbox.list).not.toHaveBeenCalled();
    expect(wraps.send).not.toHaveBeenCalled();
  });
});

describe("GET list", () => {
  it("returns mapped messages, the cursor, and no-store caching", async () => {
    const { GET, inbox } = setup();
    const res = await GET(get("?limit=10&cursor=abc"));
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const data = await res.json();
    expect(data.messages.map((m: { id: string }) => m.id)).toEqual(["a", "b"]);
    expect(data).toMatchObject({ nextToken: "next", failed: 0 });
    expect(inbox.list).toHaveBeenCalledWith({
      maxResults: 10,
      continuationToken: "abc",
    });
  });

  it("clamps the page size", async () => {
    const { GET, inbox } = setup();
    await GET(get("?limit=9999"));
    expect(inbox.list).toHaveBeenCalledWith(
      expect.objectContaining({ maxResults: 50 }),
    );
  });

  it("presigns inline images and routes downloads through the handler", async () => {
    const { GET } = setup({
      inbox: {
        get: async (id: string) =>
          email(id, {
            attachments: [
              {
                id: "i1",
                filename: "l.png",
                contentType: "image/png",
                size: 1,
                cid: "logo",
              },
              {
                id: "d1",
                filename: "f.pdf",
                contentType: "application/pdf",
                size: 1,
              },
            ],
          }),
      },
    });
    const { messages } = await (await GET(get())).json();
    expect(messages[0].attachments[0].url).toBe(
      "https://s3.example.com/signed",
    );
    expect(messages[0].attachments[1].url).toBe("/api/inbox?attachment=a%3Ad1");
  });

  it("keeps good emails when one fails to load and reports the count", async () => {
    const { GET } = setup({
      inbox: {
        get: async (id: string) => {
          if (id === "a") throw new Error("boom");
          return email(id);
        },
      },
    });
    const data = await (await GET(get())).json();
    expect(data.messages.map((m: { id: string }) => m.id)).toEqual(["b"]);
    expect(data.failed).toBe(1);
  });

  it("answers 501 when the inbox bucket is not configured", async () => {
    const { GET } = setup({ inbox: null });
    expect((await GET(get())).status).toBe(501);
  });
});

describe("GET attachment", () => {
  it("redirects to the presigned URL", async () => {
    const { GET } = setup();
    const res = await GET(get("?attachment=a:d1"));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://s3.example.com/signed");
  });

  it("rejects malformed ids and 404s unknown attachments", async () => {
    expect((await setup().GET(get("?attachment=nocolon"))).status).toBe(400);
    const { GET } = setup({
      inbox: {
        getAttachment: async () => {
          throw new Error("nope");
        },
      },
    });
    expect((await GET(get("?attachment=a:zz"))).status).toBe(404);
  });
});

describe("POST", () => {
  it("replies with threading when inReplyToMessageId is set", async () => {
    const { POST, inbox, wraps } = setup();
    const res = await POST(post({ inReplyToMessageId: "a", body: "thanks" }));
    expect(await res.json()).toEqual({ messageId: "reply-1" });
    expect(inbox.reply).toHaveBeenCalledWith("a", {
      from: "me@example.com",
      text: "thanks",
    });
    expect(wraps.send).not.toHaveBeenCalled();
  });

  it("sends a new message otherwise", async () => {
    const { POST, wraps } = setup();
    const res = await POST(
      post({ to: "a@b.co, c@d.co", subject: "Hi", body: "yo" }),
    );
    expect(await res.json()).toEqual({ messageId: "sent-1" });
    expect(wraps.send).toHaveBeenCalledWith({
      from: "me@example.com",
      to: ["a@b.co", "c@d.co"],
      subject: "Hi",
      text: "yo",
    });
  });

  it("validates input", async () => {
    const { POST } = setup();
    expect(
      (await POST(post({ to: "a@b.co", subject: "s", body: "  " }))).status,
    ).toBe(400);
    expect(
      (await POST(post({ to: "not-an-address", subject: "s", body: "b" })))
        .status,
    ).toBe(400);
    expect(
      (
        await POST(
          post({ to: "a@b.co", subject: "s\r\nBcc: x@y.z", body: "b" }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await POST(
          post({ to: "a@b.co", subject: "s", body: "x".repeat(200_001) }),
        )
      ).status,
    ).toBe(400);
  });

  it("rejects non-JSON content types (cross-site form posts)", async () => {
    const { POST, wraps } = setup();
    const res = await POST(
      post(
        { to: "a@b.co", subject: "s", body: "b" },
        "application/x-www-form-urlencoded",
      ),
    );
    expect(res.status).toBe(415);
    expect(wraps.send).not.toHaveBeenCalled();
  });

  it("surfaces provider failures as 502", async () => {
    const { POST } = setup({
      inbox: {
        reply: async () => {
          throw new Error("SES down");
        },
      },
    });
    const res = await POST(post({ inReplyToMessageId: "a", body: "b" }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("SES down");
  });
});
