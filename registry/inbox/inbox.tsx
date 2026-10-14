"use client";

import { PenSquare } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Composer } from "./composer";
import { MessageView } from "./message-view";
import { ThreadList } from "./thread-list";
import type { Draft, Message, Thread } from "./types";

export interface InboxProps {
  threads: Thread[];
  onSend: (draft: Draft) => void | Promise<void>;
  /** Called when a thread is opened, e.g. to mark it read. */
  onOpenThread?: (thread: Thread) => void;
  className?: string;
}

type Compose = { defaults?: Partial<Draft> } | null;

export function Inbox({
  threads,
  onSend,
  onOpenThread,
  className,
}: InboxProps) {
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [compose, setCompose] = React.useState<Compose>(null);
  const selected = threads.find((t) => t.id === selectedId) ?? null;

  function open(thread: Thread) {
    setSelectedId(thread.id);
    setCompose(null);
    onOpenThread?.(thread);
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
          <h2 className="text-sm font-semibold">Inbox</h2>
          <Button size="sm" onClick={() => setCompose({ defaults: {} })}>
            <PenSquare />
            Compose
          </Button>
        </div>
        <ThreadList
          className="min-h-0 flex-1"
          threads={threads}
          selectedId={selectedId}
          onSelect={open}
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
            thread={selected}
            onReply={(message) => reply(selected, message)}
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
