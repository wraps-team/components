import type { Thread } from "./types";

// 1x1 orange PNG, used to demo `cid:` resolution without network access.
const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";

export const mockThreads: Thread[] = [
  {
    id: "t1",
    subject: "Your receipt from Acme",
    participants: [{ address: "billing@acme.test", name: "Acme Billing" }],
    snippet: "Thanks for your order. Here's your receipt.",
    lastMessageAt: "2026-10-14T09:30:00.000Z",
    unread: true,
    starred: true,
    messages: [
      {
        id: "m1",
        threadId: "t1",
        direction: "inbound",
        from: { address: "billing@acme.test", name: "Acme Billing" },
        to: [{ address: "you@example.com" }],
        subject: "Your receipt from Acme",
        date: "2026-10-14T09:30:00.000Z",
        html: `<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:24px;font-family:sans-serif"><img src="cid:logo" width="32" height="32" alt="" /><h1 style="font-size:20px">Thanks for your order</h1><p>Total: <strong>$42.00</strong></p><p><a href="https://example.com/receipt">View receipt</a></p><img src="https://tracker.example.com/pixel.gif" width="1" height="1" alt="" /></td></tr></table><script>alert('blocked')</script>`,
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
    ],
  },
  {
    id: "t2",
    subject: "Re: Launch checklist",
    participants: [
      { address: "sam@example.com", name: "Sam" },
      { address: "you@example.com" },
    ],
    snippet: "Sounds good — shipping Thursday.",
    lastMessageAt: "2026-10-13T10:15:00.000Z",
    unread: false,
    messages: [
      {
        id: "m2",
        threadId: "t2",
        direction: "outbound",
        from: { address: "you@example.com" },
        to: [{ address: "sam@example.com", name: "Sam" }],
        subject: "Launch checklist",
        date: "2026-10-12T15:00:00.000Z",
        text: "Can we ship Thursday?\n\nChecklist is in the doc.",
        attachments: [],
      },
      {
        id: "m3",
        threadId: "t2",
        direction: "inbound",
        from: { address: "sam@example.com", name: "Sam" },
        to: [{ address: "you@example.com" }],
        subject: "Re: Launch checklist",
        date: "2026-10-13T10:15:00.000Z",
        text: "Sounds good — shipping Thursday.",
        attachments: [],
      },
    ],
  },
];
