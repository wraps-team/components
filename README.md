# Wraps Components

Email UI for [shadcn](https://ui.shadcn.com): an inbox, composer, and a sandboxed renderer for untrusted HTML email. Copy-in components — you own the code. Backend-agnostic; works with Wraps or anything that can produce `Thread[]`.

```bash
npx shadcn add https://components.wraps.dev/r/inbox.json
npx shadcn add https://components.wraps.dev/r/email-frame.json   # renderer only
npx shadcn add https://components.wraps.dev/r/inbox-wraps.json   # adapter for a Wraps inbox
```

| Item | What it is |
|---|---|
| `email-frame` | Sandboxed iframe for HTML email: no scripts, strict CSP, remote images blocked by default, `cid:` rewriting, auto-height |
| `inbox` | `Inbox`, `ThreadList`, `MessageView`, `Composer`, threading, search and snooze helpers (`groupIntoThreads`, `searchThreads`, `filterThreads`, `snoozePresets`, …), and `Thread`/`Message`/`Draft` types |

```tsx
import { groupIntoThreads } from "@/components/inbox/thread";

// Flat messages in, conversations out. Threads link by conversationId, then
// Message-ID / In-Reply-To / References, then a guarded subject fallback.
const threads = groupIntoThreads(messages, { state }); // state: { [threadId]: { archived, starred } }

<Inbox
  threads={threads}
  onSend={(draft) => send(draft)}
  onAction={(thread, action) => update(thread, action)} // read | unread | archive | unarchive | star | unstar
/>
```

State is yours: the components render what you pass and report actions (`onAction`, `onLabel`, `onSnooze`).

**Search** filters in the browser by default (`searchThreads`) and supports `from:` `to:` `subject:` `label:` `is:unread|read|starred|archived|snoozed` `has:attachment` `before:YYYY-MM-DD` `after:YYYY-MM-DD`, `"quoted phrases"` and `-exclusions`. For server-side search pass `search="remote"` and feed results back through `threads` from `onQueryChange`.

**Shortcuts:** `/` search, `j`/`k` or arrows move, `e` archive, `u` read/unread, `s` star. Quoted reply history is collapsed behind "Show quoted text". Snoozed threads leave the inbox until their time passes.

## Using it with Wraps

`inbox-wraps` connects the Inbox to a Wraps inbox (SES inbound → S3, see `@wraps.dev/email`):

```tsx
"use client";
import { Inbox } from "@/components/inbox/inbox";
import { useWrapsInbox } from "@/components/inbox/wraps/use-wraps-inbox";

export default function Mail() {
  const { inboxProps, status, error } = useWrapsInbox();
  if (status === "error") return <p>{error}</p>;
  return <Inbox {...inboxProps} />;
}
```

It installs `app/api/inbox/route.ts`, built on `createInboxHandlers`. **The route denies every request until you replace its `authorize` callback** with your own session check, so a mailbox is never exposed by accident. Set `WRAPS_INBOX_BUCKET` and `WRAPS_INBOX_FROM`.

Limits to know about:
- The Wraps inbox bucket holds *inbound* mail, so threads show received messages; your replies go out through SES but aren't listed back.
- Reading an email is one S3 read, so a page of 25 is 25 reads (8 in parallel). Fine for a team inbox; a database index would be the next step for large mailboxes.
- Read/archive/star/labels/snooze are kept in the browser (`localStorage`) by default. Pass your own `store` to `useWrapsInbox` to persist them elsewhere.

Contributing: see [CLAUDE.md](./CLAUDE.md). License: MIT.
