# Wraps Components

Email UI for [shadcn](https://ui.shadcn.com): an inbox, composer, and a sandboxed renderer for untrusted HTML email. Copy-in components — you own the code. Backend-agnostic; works with Wraps or anything that can produce `Thread[]`.

```bash
npx shadcn add https://components.wraps.dev/r/inbox.json
npx shadcn add https://components.wraps.dev/r/email-frame.json   # renderer only
```

| Item | What it is |
|---|---|
| `email-frame` | Sandboxed iframe for HTML email: no scripts, strict CSP, remote images blocked by default, `cid:` rewriting, auto-height |
| `inbox` | `Inbox`, `ThreadList`, `MessageView`, `Composer`, threading helpers (`groupIntoThreads`, `groupByDate`, `filterThreads`), and `Thread`/`Message`/`Draft` types |

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

State is yours: the components render what you pass and report actions. Shortcuts in the list: `j`/`k` move, `e` archive, `u` read/unread, `s` star.

Contributing: see [CLAUDE.md](./CLAUDE.md). License: MIT.
