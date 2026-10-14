"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { Draft } from "./types";

export interface ComposerProps {
  defaultValues?: Partial<Draft>;
  onSend: (draft: Draft) => void | Promise<void>;
  onDiscard?: () => void;
  className?: string;
}

export function Composer({
  defaultValues,
  onSend,
  onDiscard,
  className,
}: ComposerProps) {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const draft: Draft = {
      to: String(form.get("to") ?? "").trim(),
      cc: String(form.get("cc") ?? "").trim() || undefined,
      subject: String(form.get("subject") ?? "").trim(),
      body: String(form.get("body") ?? ""),
      inReplyToMessageId: defaultValues?.inReplyToMessageId,
      threadId: defaultValues?.threadId,
    };
    if (!draft.to) {
      setError("Add at least one recipient.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      await onSend(draft);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "flex flex-col gap-2 rounded-lg border bg-card p-3",
        className,
      )}
    >
      <Input
        name="to"
        type="text"
        aria-label="To"
        placeholder="To"
        defaultValue={defaultValues?.to}
        autoComplete="off"
      />
      <Input
        name="cc"
        type="text"
        aria-label="Cc"
        placeholder="Cc"
        defaultValue={defaultValues?.cc}
        autoComplete="off"
      />
      <Input
        name="subject"
        type="text"
        aria-label="Subject"
        placeholder="Subject"
        defaultValue={defaultValues?.subject}
      />
      <Textarea
        name="body"
        aria-label="Message"
        placeholder="Write your message…"
        rows={8}
        defaultValue={defaultValues?.body}
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send"}
        </Button>
        {onDiscard && (
          <Button type="button" variant="ghost" onClick={onDiscard}>
            Discard
          </Button>
        )}
      </div>
    </form>
  );
}
