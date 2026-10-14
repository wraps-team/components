# Wraps Components

shadcn-style registry of **email UI** — inbox, composer, and a sandboxed HTML email renderer — distributed with `shadcn add`. Source is the product: users copy it into their repo and own it. Backend-agnostic; Wraps is the first-class adapter, not a requirement.

## Layout

- `registry/inbox/*` — inbox UI items (main focus). `registry/inbox/wraps/*` — the Wraps adapter (`inbox-wraps`); `route.ts` there is a template excluded from tsc/biome and verified by the install test instead. `registry/templates/*` — send-side email template blocks (secondary, not started).
- `registry.json` — the manifest. Every installed file declares an explicit `target` under `components/inbox/` so sibling imports (`./types`) survive install.
- `components/ui/*` — shadcn primitives used only by the preview app. Registry items reference them via `registryDependencies`, never copy them.
- `app/` — preview/docs site. `public/r/` — `shadcn build` output (gitignored).

## Commands

```bash
mise trust && mise install   # Node 22
pnpm install
pnpm dev                     # preview site
pnpm registry:build          # registry.json -> public/r/*.json
pnpm lint | pnpm typecheck | pnpm test | pnpm build
```

## Rules

1. **`EmailFrame` is the security boundary.** Never add `allow-scripts` to its sandbox (it already has `allow-same-origin` for auto-sizing, which is only safe because scripts can't run). Keep the CSP `default-src 'none'`, remote images off by default, and `cid:` rewriting. Changes need the checks in `registry/inbox/email-frame.tsx` re-verified.
2. **Types are backend-agnostic.** Components take `Thread`/`Message`/`Draft` props and callbacks (`onSend`, `onOpenThread`). No fetching, no provider imports in registry items. Provider mapping belongs in adapters.
3. **Semantic tokens only** (`bg-background`, `text-muted-foreground`, …) — no hex or palette classes — so installs follow the consumer's theme. Email *content* inside `EmailFrame` is the one exception; it must render as the sender intended.
4. **Verify through install, not just build.** The contract is `shadcn add <url>` into a fresh Next app that then type-checks and builds. Run it before shipping a registry change.
5. **Threading logic is pure and tested.** `registry/inbox/thread.ts` has no React and no I/O; every grouping rule has a case in `thread.test.ts`. Change a rule, change the test first. Tests are not part of any registry item.
6. **Registry code must be portable.** It's copied into projects with unknown `tsconfig` targets: no `findLast`, `at()`, or other ES2023+ APIs.
7. **The adapter is secure by default.** `createInboxHandlers` requires `authorize`, and the installed route template returns false. Never make `authorize` optional or default it to allow.
8. **Cross-item `registryDependencies` use absolute URLs** (`https://components.wraps.dev/r/<name>.json`). For local testing, serve a copy of `public/r` with the host rewritten to localhost.

## Quality bar

shadcn's Oct 2026 AI Elements release is our reference for care and polish (https://ui.shadcn.com/docs/changelog/2026-10-ai-elements). Match it on:

- **Composition over props sprawl** — small parts that nest (thread → message → attachment), not one mega-component with 30 props.
- **One interaction model, fully keyboard- and screen-reader-accessible** — real buttons/triggers, `aria-current`, labelled controls.
- **Explicit states** — `pending` / `running` / `error` for send and sync, not just the happy path.
- **Scroll that behaves** — anchored position, older mail loading without jumping; lists must stay smooth at thousands of rows.
- **Docs per component** — live preview, copyable code, a Markdown version for coding agents, migration notes that keep export names and props stable.
- **Copy-in ownership** — no package dependency; the user owns the code.

## Commits and versioning

- **Conventional commits** on every commit: `type(scope): subject` — `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`. Scope is the registry item when one applies (`feat(inbox): …`, `fix(email-frame): …`). Breaking changes use `!` and a `BREAKING CHANGE:` footer.
- **Strict semver**, one version for the repo (`package.json`), currently 0.x. A registry's public API is what an install produces, so:
  - **major** (minor while 0.x): renamed/removed exports, props or type fields; changed install `target` paths; changed `registryDependencies`; any loosening of `EmailFrame`'s sandbox or CSP defaults.
  - **minor**: new items, components, optional props, or type fields.
  - **patch**: fixes that keep every export, prop, type and install path intact.
- **Release** like the sibling repos: `npm version patch|minor|major --no-git-tag-version`, commit `chore: release vX.Y.Z`, push, publish a GitHub release tagged `vX.Y.Z`. Keep a note in the release for anything consumers must re-copy.
