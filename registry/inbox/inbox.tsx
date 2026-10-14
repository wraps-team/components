"use client";

import { PenSquare } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Composer } from "./composer";
import { MessageView } from "./message-view";
import { countUnread, filterThreads, labelsOf } from "./thread";
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
  const visible = React.useMemo(
    () => filterThreads(threads, folder, at),
    [threads, folder, at],
  );
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

  return (
    <div
      className={cn(
        "grid h-[640px] grid-cols-[320px_1fr] overflow-hidden rounded-lg border bg-background",
        className,
      )}
    >
      <aside className="flex min-h-0 flex-col border-r">
        <div className="flex items-center justify-between border-b p-3">
          <h2 className="text-sm font-semibold">{current?.label}</h2>
          <Button size="sm" onClick={() => setCompose({ defaults: {} })}>
            <PenSquare />
            Compose
          </Button>
        </div>
        <nav aria-label="Folders" className="flex gap-1 border-b p-2">
          {FOLDERS.map((f) => {
            const unread = countUnread(threads, f.id, at);
            return (
              <button
                key={f.id}
                type="button"
                aria-current={folder === f.id || undefined}
                onClick={() => setFolder(f.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  folder === f.id && "bg-accent text-foreground",
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
          empty={current?.empty}
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
