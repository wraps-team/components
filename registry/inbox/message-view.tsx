"use client";

import { Paperclip } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EmailFrame } from "./email-frame";
import { useFormattedDate } from "./format";
import type { Message, Thread } from "./types";

export interface MessageViewProps {
  thread: Thread;
  onReply?: (message: Message) => void;
  className?: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function MessageCard({
  message,
  onReply,
}: {
  message: Message;
  onReply?: (message: Message) => void;
}) {
  const [allowImages, setAllowImages] = React.useState(false);
  const [blocked, setBlocked] = React.useState(false);
  const from = message.from.name || message.from.address;
  const when = useFormattedDate(message.date, "full");
  const downloadable = message.attachments.filter((a) => !a.inline);

  return (
    <article className="rounded-lg border bg-card">
      <header className="flex items-start gap-3 border-b p-4">
        <div className="min-w-0 flex-1">
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
        </div>
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
          onRemoteImagesBlocked={setBlocked}
        />
      ) : (
        <pre className="whitespace-pre-wrap break-words p-4 font-sans text-sm">
          {message.text}
        </pre>
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

export function MessageView({ thread, onReply, className }: MessageViewProps) {
  return (
    <div className={cn("flex flex-col gap-4 overflow-y-auto p-4", className)}>
      <h2 className="text-lg font-semibold">{thread.subject}</h2>
      {thread.messages.map((message) => (
        <MessageCard key={message.id} message={message} onReply={onReply} />
      ))}
    </div>
  );
}
