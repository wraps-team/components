"use client";

import { Paperclip, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFormattedDate } from "./format";
import type { Thread } from "./types";

export interface ThreadListProps {
  threads: Thread[];
  selectedId?: string | null;
  onSelect?: (thread: Thread) => void;
  className?: string;
}

function ThreadTime({ iso }: { iso: string }) {
  return <>{useFormattedDate(iso, "list")}</>;
}

export function ThreadList({
  threads,
  selectedId,
  onSelect,
  className,
}: ThreadListProps) {
  return (
    <ul className={cn("flex flex-col overflow-y-auto", className)}>
      {threads.map((thread) => {
        const last = thread.messages[thread.messages.length - 1];
        const from = last?.from.name || last?.from.address || "Unknown";
        const hasAttachment = thread.messages.some(
          (m) => m.attachments.length > 0,
        );
        return (
          // content-visibility keeps off-screen rows from costing layout/paint,
          // which keeps long lists scrolling smoothly without virtualization.
          <li
            key={thread.id}
            className="border-b [contain-intrinsic-size:auto_76px] [content-visibility:auto]"
          >
            <button
              type="button"
              onClick={() => onSelect?.(thread)}
              aria-current={selectedId === thread.id}
              className={cn(
                "flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
                selectedId === thread.id && "bg-accent",
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
                  {from}
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
                  thread.unread ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {thread.subject}
              </span>
              <span className="line-clamp-1 text-xs text-muted-foreground">
                {thread.snippet}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
