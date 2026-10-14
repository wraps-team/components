import { groupIntoThreads } from "./thread";
import type { Message, ThreadState } from "./types";

// 1x1 orange PNG, used to demo `cid:` resolution without network access.
const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4WSz2HwAGbQKC0JqqYgAAAABJRU5ErkJggg==";

/** Fixed clock so the demo's date sections render identically everywhere. */
export const MOCK_NOW = new Date("2026-10-14T16:00:00.000Z");

const me = { address: "you@example.com" };
const sam = { address: "sam@example.com", name: "Sam" };
const acme = { address: "billing@acme.test", name: "Acme Billing" };

const receiptHtml = `<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:24px;font-family:sans-serif"><img src="cid:logo" width="32" height="32" alt="" /><h1 style="font-size:20px">Thanks for your order</h1><p>Total: <strong>$42.00</strong></p><p><a href="https://example.com/receipt">View receipt</a></p><img src="https://tracker.example.com/pixel.gif" width="1" height="1" alt="" /></td></tr></table><script>alert('blocked')</script>`;

/**
 * A flat mailbox: what most backends return. `groupIntoThreads` turns it into
 * conversations — by Message-ID headers for the Launch checklist, by the
 * subject fallback for Q3 invoice (no headers), and it leaves the two
 * "Your receipt" mails apart because they're unrelated.
 */
export const mockMessages: Message[] = [
  {
    id: "m-receipt",
    threadId: "",
    direction: "inbound",
    from: acme,
    to: [me],
    subject: "Your receipt from Acme",
    date: "2026-10-14T09:30:00.000Z",
    html: receiptHtml,
    read: false,
    messageId: "<receipt-oct@acme.test>",
    attachments: [
      {
        id: "a1",
        filename: "logo.png",
        contentType: "image/png",
        size: 68,
        cid: "logo",
        inline: true,
        url: PIXEL,
      },
      {
        id: "a2",
        filename: "receipt.pdf",
        contentType: "application/pdf",
        size: 48_213,
        url: "#",
      },
    ],
  },
  {
    id: "m-launch-1",
    threadId: "",
    direction: "outbound",
    from: me,
    to: [sam],
    subject: "Launch checklist",
    date: "2026-10-11T15:00:00.000Z",
    text: "Can we ship Thursday?\n\nChecklist is in the doc.",
    messageId: "<launch-1@example.com>",
    attachments: [],
  },
  {
    id: "m-launch-2",
    threadId: "",
    direction: "inbound",
    from: sam,
    to: [me],
    subject: "Re: Launch checklist",
    date: "2026-10-12T09:15:00.000Z",
    text: "Looking at it now. Two items still open: the changelog and the migration note.",
    messageId: "<launch-2@example.com>",
    inReplyTo: "<launch-1@example.com>",
    references: ["<launch-1@example.com>"],
    attachments: [],
  },
  {
    id: "m-launch-3",
    threadId: "",
    direction: "outbound",
    from: me,
    to: [sam],
    subject: "Re: Launch checklist",
    date: "2026-10-12T14:40:00.000Z",
    text: "Changelog is done. I'll write the migration note tonight.",
    messageId: "<launch-3@example.com>",
    inReplyTo: "<launch-2@example.com>",
    references: ["<launch-1@example.com>", "<launch-2@example.com>"],
    attachments: [],
  },
  {
    id: "m-launch-4",
    threadId: "",
    direction: "inbound",
    from: sam,
    to: [me],
    subject: "Re: Launch checklist",
    date: "2026-10-13T10:15:00.000Z",
    text: "Sounds good — shipping Thursday.",
    messageId: "<launch-4@example.com>",
    inReplyTo: "<launch-3@example.com>",
    references: [
      "<launch-1@example.com>",
      "<launch-2@example.com>",
      "<launch-3@example.com>",
    ],
    read: false,
    attachments: [],
  },
  {
    id: "m-invoice-1",
    threadId: "",
    direction: "inbound",
    from: { address: "ap@globex.test", name: "Globex AP" },
    to: [me],
    subject: "Q3 invoice",
    date: "2026-10-08T11:00:00.000Z",
    text: "Attached is the Q3 invoice. Net 30.",
    attachments: [],
  },
  {
    id: "m-invoice-2",
    threadId: "",
    direction: "outbound",
    from: me,
    to: [{ address: "ap@globex.test", name: "Globex AP" }],
    subject: "Re: Q3 invoice",
    date: "2026-10-09T13:20:00.000Z",
    text: "Received, thanks. Payment is scheduled for the 25th.",
    attachments: [],
  },
  {
    id: "m-welcome",
    threadId: "",
    direction: "inbound",
    from: acme,
    to: [me],
    subject: "Welcome to Acme",
    date: "2026-09-20T12:00:00.000Z",
    text: "Welcome aboard! Here's how to get started.",
    attachments: [],
  },
  {
    id: "m-receipt-old",
    threadId: "",
    direction: "inbound",
    from: acme,
    to: [me],
    subject: "Your receipt from Acme",
    date: "2026-09-02T09:30:00.000Z",
    text: "Thanks for your order. Total: $19.00",
    attachments: [],
  },
];

/** Persisted thread state, keyed by thread id (the earliest message's id). */
export const mockState: Record<string, ThreadState> = {
  "m-welcome": { archived: true },
  "m-launch-1": { starred: true },
};

export const mockThreads = groupIntoThreads(mockMessages, {
  state: mockState,
});
