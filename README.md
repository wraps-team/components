# Wraps Components

Email UI for [shadcn](https://ui.shadcn.com): an inbox, composer, and a sandboxed renderer for untrusted HTML email. Copy-in components — you own the code. Backend-agnostic; works with Wraps or anything that can produce `Thread[]`.

```bash
npx shadcn add https://components.wraps.dev/r/inbox.json
npx shadcn add https://components.wraps.dev/r/email-frame.json   # renderer only
```

| Item | What it is |
|---|---|
| `email-frame` | Sandboxed iframe for HTML email: no scripts, strict CSP, remote images blocked by default, `cid:` rewriting, auto-height |
| `inbox` | `Inbox`, `ThreadList`, `MessageView`, `Composer`, and `Thread`/`Message`/`Draft` types |

```tsx
<Inbox threads={threads} onSend={(draft) => send(draft)} />
```

Contributing: see [CLAUDE.md](./CLAUDE.md). License: MIT.
