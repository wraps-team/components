"use client";

import {
  Archive,
  ArchiveRestore,
  ChevronsUpDown,
  Mail,
  MailOpen,
  Paperclip,
  Star,
} from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EmailFrame } from "./email-frame";
import { useFormattedDate } from "./format";
import { hasQuotedHtml, snippetOf, splitQuoted } from "./thread";
import type { Message, Thread, ThreadAction } from "./types";

export interface MessageViewProps {
  thread: Thread;
  onReply?: (message: Message) => void;
  /** Toolbar actions: archive, mark read/unread, star. */
  onAction?: (thread: Thread, action: ThreadAction) => void;
  className?: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Long threads open on the latest message (plus anything unread); short
// threads open fully.
function initialExpanded(thread: Thread): Set<string> {
  if (thread.messages.length <= 2) {
    return new Set(thread.messages.map((m) => m.id));
  }
  const ids = new Set<string>();
  const last = thread.messages[thread.messages.length - 1];
  if (last) ids.add(last.id);
  for (const m of thread.messages) {
    if (m.direction === "inbound" && m.read === false) ids.add(m.id);
  }
  return ids;
}

function MessageCard({
  message,
  expanded,
  onToggle,
  onReply,
}: {
  message: Message;
  expanded: boolean;
  onToggle: () => void;
  onReply?: (message: Message) => void;
}) {
  const [allowImages, setAllowImages] = React.useState(false);
  const [blocked, setBlocked] = React.useState(false);
  const [showQuoted, setShowQuoted] = React.useState(false);
  const split = React.useMemo(
    () => (message.html ? null : splitQuoted(message.text ?? "")),
    [message.html, message.text],
  );
  const hasQuoted = message.html
    ? hasQuotedHtml(message.html)
    : Boolean(split?.quoted);
  const from = message.from.name || message.from.address;
  const when = useFormattedDate(message.date, "full");
  const downloadable = message.attachments.filter((a) => !a.inline);

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={false}
        className="flex w-full items-center gap-3 rounded-lg border bg-card px-4 py-3 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <span className="shrink-0 text-sm font-medium">{from}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
          {snippetOf(message, 100)}
        </span>
        <time
          dateTime={message.date}
          className="shrink-0 text-xs text-muted-foreground"
        >
          {when}
        </time>
      </button>
    );
  }

  return (
    <article className="rounded-lg border bg-card">
      <header className="flex items-start gap-3 border-b p-4">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={true}
          aria-label="Collapse message"
          className="min-w-0 flex-1 rounded-sm text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <p className="truncate text-sm font-medium">
            {from}
            {message.from.name && (
              <span className="font-normal text-muted-foreground">
                {" "}
                &lt;{message.from.address}&gt;
              </span>
            )}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            to {message.to.map((a) => a.name || a.address).join(", ")}
          </p>
        </button>
        <time
          dateTime={message.date}
          className="shrink-0 text-xs text-muted-foreground"
        >
          {when}
        </time>
      </header>

      {blocked && (
        <div className="flex items-center gap-2 border-b bg-muted px-4 py-2 text-xs text-muted-foreground">
          Remote images are blocked to protect your privacy.
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            onClick={() => setAllowImages(true)}
          >
            Load images
          </Button>
        </div>
      )}

      {message.html ? (
        <EmailFrame
          html={message.html}
          attachments={message.attachments}
          allowRemoteImages={allowImages}
          collapseQuoted={!showQuoted}
          onRemoteImagesBlocked={setBlocked}
        />
      ) : (
        <div className="p-4 text-sm">
          <pre className="whitespace-pre-wrap break-words font-sans">
            {split?.body}
          </pre>
          {showQuoted && split?.quoted && (
            <pre className="mt-3 whitespace-pre-wrap break-words border-l-2 pl-3 font-sans text-muted-foreground">
              {split.quoted}
            </pre>
          )}
        </div>
      )}

      {hasQuoted && (
        <div className="border-t px-4 py-1.5">
          <button
            type="button"
            aria-expanded={showQuoted}
            onClick={() => setShowQuoted((v) => !v)}
            className="rounded-sm text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {showQuoted ? "Hide quoted text" : "Show quoted text"}
          </button>
        </div>
      )}

      {downloadable.length > 0 && (
        <ul className="flex flex-wrap gap-2 border-t p-4">
          {downloadable.map((a) => (
            <li key={a.id}>
              <a
                href={a.url}
                download={a.filename}
                className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs hover:bg-accent"
              >
                <Paperclip className="size-3" />
                {a.filename}
                <span className="text-muted-foreground">
                  {formatSize(a.size)}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {onReply && (
        <footer className="border-t p-3">
          <Button variant="outline" size="sm" onClick={() => onReply(message)}>
            Reply
          </Button>
        </footer>
      )}
    </article>
  );
}

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

/**
 * Pass `key={thread.id}` so expansion state resets when the thread changes.
 */
export function MessageView({
  thread,
  onReply,
  onAction,
  className,
}: MessageViewProps) {
  const [expanded, setExpanded] = React.useState(() => initialExpanded(thread));
  const allExpanded = thread.messages.every((m) => expanded.has(m.id));

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className={cn("flex flex-col gap-4 overflow-y-auto p-4", className)}>
      <div className="flex items-start gap-2">
        <h2 className="min-w-0 flex-1 text-lg font-semibold">
          {thread.subject}
        </h2>
        <div className="flex shrink-0 items-center">
          {!allExpanded && (
            <ToolbarButton
              label="Expand all"
              onClick={() =>
                setExpanded(new Set(thread.messages.map((m) => m.id)))
              }
            >
              <ChevronsUpDown />
            </ToolbarButton>
          )}
          {onAction && (
            <>
              <ToolbarButton
                label={thread.starred ? "Unstar" : "Star"}
                onClick={() =>
                  onAction(thread, thread.starred ? "unstar" : "star")
                }
              >
                <Star
                  className={cn(thread.starred && "fill-current text-primary")}
                />
              </ToolbarButton>
              <ToolbarButton
                label={thread.unread ? "Mark read" : "Mark unread"}
                onClick={() =>
                  onAction(thread, thread.unread ? "read" : "unread")
                }
              >
                {thread.unread ? <MailOpen /> : <Mail />}
              </ToolbarButton>
              <ToolbarButton
                label={thread.archived ? "Move to inbox" : "Archive"}
                onClick={() =>
                  onAction(thread, thread.archived ? "unarchive" : "archive")
                }
              >
                {thread.archived ? <ArchiveRestore /> : <Archive />}
              </ToolbarButton>
            </>
          )}
        </div>
      </div>
      {thread.messages.map((message) => (
        <MessageCard
          key={message.id}
          message={message}
          expanded={expanded.has(message.id)}
          onToggle={() => toggle(message.id)}
          onReply={onReply}
        />
      ))}
    </div>
  );
}
