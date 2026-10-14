"use client";

import {
  Archive,
  ArchiveRestore,
  Mail,
  MailOpen,
  Paperclip,
  Star,
} from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { useFormattedDate } from "./format";
import { groupByDate } from "./thread";
import type { Thread, ThreadAction } from "./types";

export interface ThreadListProps {
  threads: Thread[];
  selectedId?: string | null;
  onSelect?: (thread: Thread) => void;
  /** Row actions and keyboard shortcuts (e archive, u read/unread, s star). */
  onAction?: (thread: Thread, action: ThreadAction) => void;
  /** Section threads under Today / Yesterday / … headers. Default true. */
  grouped?: boolean;
  /** Reference time for grouping. Defaults to the viewer's clock after mount. */
  now?: Date;
  /** Shown when `threads` is empty. */
  empty?: React.ReactNode;
  className?: string;
}

function ThreadTime({ iso }: { iso: string }) {
  return <>{useFormattedDate(iso, "list")}</>;
}

function RowAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {children}
    </button>
  );
}

export function ThreadList({
  threads,
  selectedId,
  onSelect,
  onAction,
  grouped = true,
  now,
  empty,
  className,
}: ThreadListProps) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [clock, setClock] = React.useState<Date | null>(null);
  React.useEffect(() => setClock(now ?? new Date()), [now]);

  // Group only once we have a clock, so server and first client render match.
  const reference = now ?? clock;
  const groups = React.useMemo(
    () =>
      grouped && reference
        ? groupByDate(threads, reference)
        : [{ label: null, threads }],
    [grouped, reference, threads],
  );

  function focusRow(from: HTMLElement, step: 1 | -1) {
    const rows = [
      ...(rootRef.current?.querySelectorAll<HTMLElement>("[data-thread-row]") ??
        []),
    ];
    rows[rows.indexOf(from) + step]?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const row = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-thread-row]",
    );
    if (!row || event.metaKey || event.ctrlKey || event.altKey) return;
    const thread = threads.find((t) => t.id === row.dataset.threadId);
    if (!thread) return;
    const act = (action: ThreadAction) => {
      event.preventDefault();
      onAction?.(thread, action);
    };
    switch (event.key) {
      case "j":
      case "ArrowDown":
        event.preventDefault();
        return focusRow(row, 1);
      case "k":
      case "ArrowUp":
        event.preventDefault();
        return focusRow(row, -1);
      case "e":
        return act(thread.archived ? "unarchive" : "archive");
      case "u":
        return act(thread.unread ? "read" : "unread");
      case "s":
        return act(thread.starred ? "unstar" : "star");
    }
  }

  if (threads.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center p-8 text-sm text-muted-foreground",
          className,
        )}
      >
        {empty ?? "No conversations"}
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      onKeyDown={onKeyDown}
      className={cn("overflow-y-auto", className)}
    >
      {groups.map((group) => (
        <section
          key={group.label ?? "all"}
          aria-label={group.label ?? "Threads"}
        >
          {group.label && (
            <h3 className="sticky top-0 z-10 border-b bg-background/95 px-4 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur">
              {group.label}
            </h3>
          )}
          <ul className="flex flex-col">
            {group.threads.map((thread) => {
              // Label the row with who the conversation is with: the latest
              // inbound sender, or the recipient if we only ever wrote.
              const lastInbound = [...thread.messages]
                .reverse()
                .find((m) => m.direction === "inbound");
              const label = lastInbound
                ? lastInbound.from.name || lastInbound.from.address
                : `To: ${
                    thread.messages[0]?.to[0]?.name ||
                    thread.messages[0]?.to[0]?.address ||
                    "Unknown"
                  }`;
              const hasAttachment = thread.messages.some(
                (m) => m.attachments.length > 0,
              );
              const selected = selectedId === thread.id;
              return (
                // content-visibility keeps off-screen rows from costing layout/paint,
                // which keeps long lists scrolling smoothly without virtualization.
                <li
                  key={thread.id}
                  className="group relative border-b [contain-intrinsic-size:auto_76px] [content-visibility:auto]"
                >
                  <button
                    type="button"
                    data-thread-row=""
                    data-thread-id={thread.id}
                    onClick={() => onSelect?.(thread)}
                    aria-current={selected || undefined}
                    className={cn(
                      "flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
                      selected && "bg-accent",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {thread.unread && (
                        <span
                          role="img"
                          aria-label="Unread"
                          className="size-2 shrink-0 rounded-full bg-primary"
                        />
                      )}
                      <span
                        className={cn(
                          "truncate text-sm",
                          thread.unread ? "font-semibold" : "font-medium",
                        )}
                      >
                        {label}
                      </span>
                      {thread.messages.length > 1 && (
                        <span className="text-xs text-muted-foreground">
                          {thread.messages.length}
                        </span>
                      )}
                      <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                        {hasAttachment && <Paperclip className="size-3" />}
                        {thread.starred && (
                          <Star className="size-3 fill-current text-primary" />
                        )}
                        <ThreadTime iso={thread.lastMessageAt} />
                      </span>
                    </div>
                    <span
                      className={cn(
                        "truncate text-sm",
                        thread.unread
                          ? "text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {thread.subject}
                    </span>
                    <span className="line-clamp-1 text-xs text-muted-foreground">
                      {thread.snippet}
                    </span>
                  </button>
                  {onAction && (
                    <div className="absolute top-2 right-2 hidden items-center gap-0.5 rounded-md border bg-accent p-0.5 shadow-xs group-focus-within:flex group-hover:flex">
                      <RowAction
                        label={thread.starred ? "Unstar" : "Star"}
                        onClick={() =>
                          onAction(thread, thread.starred ? "unstar" : "star")
                        }
                      >
                        <Star
                          className={cn(
                            "size-4",
                            thread.starred && "fill-current text-primary",
                          )}
                        />
                      </RowAction>
                      <RowAction
                        label={thread.unread ? "Mark read" : "Mark unread"}
                        onClick={() =>
                          onAction(thread, thread.unread ? "read" : "unread")
                        }
                      >
                        {thread.unread ? (
                          <MailOpen className="size-4" />
                        ) : (
                          <Mail className="size-4" />
                        )}
                      </RowAction>
                      <RowAction
                        label={thread.archived ? "Move to inbox" : "Archive"}
                        onClick={() =>
                          onAction(
                            thread,
                            thread.archived ? "unarchive" : "archive",
                          )
                        }
                      >
                        {thread.archived ? (
                          <ArchiveRestore className="size-4" />
                        ) : (
                          <Archive className="size-4" />
                        )}
                      </RowAction>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
