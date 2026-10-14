"use client";

import { PenSquare, Search } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Composer } from "./composer";
import { MessageView } from "./message-view";
import { countUnread, filterThreads, labelsOf, searchThreads } from "./thread";
import { ThreadList } from "./thread-list";
import type { Draft, Folder, Message, Thread, ThreadAction } from "./types";

export interface InboxProps {
  /** Build these with `groupIntoThreads` if your backend returns flat messages. */
  threads: Thread[];
  onSend: (draft: Draft) => void | Promise<void>;
  /**
   * Read, unread, archive, star. State lives with you: update `threads` in
   * response. Opening an unread thread also fires `"read"`.
   */
  onAction?: (thread: Thread, action: ThreadAction) => void;
  /** Labels the user can apply. Defaults to the labels already in use. */
  labels?: string[];
  onLabel?: (thread: Thread, label: string, applied: boolean) => void;
  /** Snooze until a time, or `null` to unsnooze. */
  onSnooze?: (thread: Thread, until: Date | null) => void;
  /**
   * `"local"` (default) filters `threads` in the browser with `searchThreads`.
   * `"remote"` leaves filtering to you: watch `onQueryChange` and pass the
   * matching threads (debounce it; it fires on every keystroke).
   */
  search?: "local" | "remote";
  defaultQuery?: string;
  onQueryChange?: (query: string) => void;
  /** Called when a thread is opened. */
  onOpenThread?: (thread: Thread) => void;
  defaultFolder?: Folder;
  /** Reference time for date sections. Pass a fixed value for deterministic SSR. */
  now?: Date;
  className?: string;
}

type Compose = { defaults?: Partial<Draft> } | null;

const FOLDERS: { id: Folder; label: string; empty: string }[] = [
  { id: "inbox", label: "Inbox", empty: "You're all caught up" },
  { id: "starred", label: "Starred", empty: "No starred conversations" },
  { id: "snoozed", label: "Snoozed", empty: "Nothing snoozed" },
  { id: "archived", label: "Archived", empty: "Nothing archived" },
];

export function Inbox({
  threads,
  onSend,
  onAction,
  labels,
  onLabel,
  onSnooze,
  search = "local",
  defaultQuery = "",
  onQueryChange,
  onOpenThread,
  defaultFolder = "inbox",
  now,
  className,
}: InboxProps) {
  const [folder, setFolder] = React.useState<Folder>(defaultFolder);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [compose, setCompose] = React.useState<Compose>(null);
  // Snoozes are time-dependent. Before mount we have no clock, so use the
  // epoch: everything snoozed stays hidden, matching server rendering.
  const [clock, setClock] = React.useState<Date | null>(now ?? null);
  React.useEffect(() => {
    if (now) return setClock(now);
    setClock(new Date());
    const id = setInterval(() => setClock(new Date()), 60_000);
    return () => clearInterval(id);
  }, [now]);
  const at = clock ?? new Date(0);
  const [query, setQuery] = React.useState(defaultQuery);
  const searching = query.trim() !== "";
  const rootRef = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  // While searching, results span every folder (like Gmail).
  const visible = React.useMemo(() => {
    if (!searching) return filterThreads(threads, folder, at);
    return search === "remote" ? threads : searchThreads(threads, query, at);
  }, [threads, folder, at, searching, search, query]);

  function changeQuery(next: string) {
    setQuery(next);
    onQueryChange?.(next);
  }
  const labelOptions = React.useMemo(
    () => labels ?? labelsOf(threads),
    [labels, threads],
  );
  const selected = threads.find((t) => t.id === selectedId) ?? null;
  const current = FOLDERS.find((f) => f.id === folder) ?? FOLDERS[0];

  function open(thread: Thread) {
    setSelectedId(thread.id);
    setCompose(null);
    onOpenThread?.(thread);
    if (thread.unread) onAction?.(thread, "read");
  }

  // When a thread leaves the current folder, move the reading pane to its
  // neighbor instead of leaving a stale thread open.
  function advanceFrom(thread: Thread) {
    if (thread.id !== selectedId) return;
    const index = visible.findIndex((t) => t.id === thread.id);
    const next = visible[index + 1] ?? visible[index - 1];
    setSelectedId(next?.id ?? null);
  }

  function act(thread: Thread, action: ThreadAction) {
    onAction?.(thread, action);
    const leavesFolder =
      (folder === "inbox" && action === "archive") ||
      (folder === "archived" && action === "unarchive") ||
      (folder === "starred" && action === "unstar");
    if (leavesFolder) advanceFrom(thread);
  }

  function snooze(thread: Thread, until: Date | null) {
    onSnooze?.(thread, until);
    if (
      (folder === "inbox" && until && until.getTime() > at.getTime()) ||
      (folder === "snoozed" && !until)
    )
      advanceFrom(thread);
  }

  function reply(thread: Thread, message: Message) {
    const replyTo =
      message.direction === "inbound"
        ? message.from
        : (message.to[0] ?? message.from);
    setCompose({
      defaults: {
        to: replyTo.address,
        subject: /^re:/i.test(thread.subject)
          ? thread.subject
          : `Re: ${thread.subject}`,
        inReplyToMessageId: message.id,
        threadId: thread.id,
      },
    });
  }

  async function send(draft: Draft) {
    await onSend(draft);
    setCompose(null);
  }

  function onRootKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const typing =
      target.closest("input, textarea, select, [contenteditable='true']") !==
      null;
    if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      searchRef.current?.focus();
    }
  }

  return (
    <div
      ref={rootRef}
      onKeyDown={onRootKeyDown}
      className={cn(
        "grid h-[640px] grid-cols-[320px_1fr] overflow-hidden rounded-lg border bg-background",
        className,
      )}
    >
      <aside className="flex min-h-0 flex-col border-r">
        <div className="flex items-center justify-between border-b p-3">
          <h2 className="text-sm font-semibold">
            {searching ? "Search results" : current?.label}
          </h2>
          <Button size="sm" onClick={() => setCompose({ defaults: {} })}>
            <PenSquare />
            Compose
          </Button>
        </div>
        <div className="relative border-b p-2">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            type="search"
            aria-label="Search mail"
            placeholder="Search mail ( / )"
            value={query}
            onChange={(e) => changeQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                changeQuery("");
                e.currentTarget.blur();
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                rootRef.current
                  ?.querySelector<HTMLElement>("[data-thread-row]")
                  ?.focus();
              }
            }}
            className="h-8 pl-8 text-xs"
          />
        </div>
        <nav aria-label="Folders" className="flex gap-1 border-b p-2">
          {FOLDERS.map((f) => {
            const unread = countUnread(threads, f.id, at);
            return (
              <button
                key={f.id}
                type="button"
                aria-current={(!searching && folder === f.id) || undefined}
                onClick={() => {
                  setFolder(f.id);
                  if (searching) changeQuery("");
                }}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  !searching && folder === f.id && "bg-accent text-foreground",
                )}
              >
                {f.label}
                {unread > 0 && (
                  <span className="rounded-full bg-primary px-1.5 text-[10px] leading-4 text-primary-foreground">
                    {unread}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        <ThreadList
          className="min-h-0 flex-1"
          threads={visible}
          selectedId={selectedId}
          onSelect={open}
          onAction={onAction ? act : undefined}
          now={now}
          empty={searching ? "No matches" : current?.empty}
        />
      </aside>
      <section className="flex min-h-0 flex-col overflow-y-auto">
        {compose ? (
          <div className="p-4">
            <Composer
              defaultValues={compose.defaults}
              onSend={send}
              onDiscard={() => setCompose(null)}
            />
          </div>
        ) : selected ? (
          <MessageView
            key={selected.id}
            thread={selected}
            onReply={(message) => reply(selected, message)}
            onAction={onAction ? act : undefined}
            labels={labelOptions}
            onLabel={onLabel}
            onSnooze={onSnooze ? snooze : undefined}
            now={now}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Select a conversation
          </div>
        )}
      </section>
    </div>
  );
}
