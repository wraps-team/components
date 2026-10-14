"use client";

import * as React from "react";
import { groupIntoThreads } from "../thread";
import type {
  Draft,
  Message,
  Thread,
  ThreadAction,
  ThreadState,
} from "../types";
import {
  applyReadState,
  emptyState,
  type LocalState,
  localStorageStore,
  patchThread,
  reduceAction,
  type StateStore,
} from "./state";

export interface UseWrapsInboxOptions {
  /** Route that serves `createInboxHandlers`. Default "/api/inbox". */
  endpoint?: string;
  /**
   * Where read/archive/star/labels/snooze are kept. Defaults to localStorage
   * (per browser). Pass your own `StateStore` to persist elsewhere.
   */
  store?: StateStore;
  /** Re-fetch the newest page on this interval. Off by default. */
  pollMs?: number;
}

interface Page {
  messages: Message[];
  nextToken?: string;
  failed: number;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin", ...init });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

/**
 * Connect `<Inbox>` to a Wraps inbox:
 *
 *   const { inboxProps, status, error } = useWrapsInbox();
 *   return <Inbox {...inboxProps} />;
 *
 * The Wraps inbox bucket holds inbound mail only, so threads contain received
 * messages (your replies go out through SES but are not listed back), and
 * mailbox state is local until you provide a `store`.
 */
export function useWrapsInbox(options: UseWrapsInboxOptions = {}) {
  const { endpoint = "/api/inbox", pollMs } = options;
  const store = React.useMemo(
    () => options.store ?? localStorageStore("wraps-inbox"),
    [options.store],
  );
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [local, setLocal] = React.useState<LocalState | null>(null);
  const [nextToken, setNextToken] = React.useState<string | undefined>();
  const [status, setStatus] = React.useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const loaded = store.load() ?? emptyState(new Date().toISOString());
    store.save(loaded);
    setLocal(loaded);
  }, [store]);

  const update = React.useCallback(
    (fn: (state: LocalState) => LocalState) => {
      setLocal((prev) => {
        if (!prev) return prev;
        const next = fn(prev);
        store.save(next);
        return next;
      });
    },
    [store],
  );

  const merge = React.useCallback((incoming: Message[]) => {
    setMessages((prev) => {
      const byId = new Map(prev.map((m) => [m.id, m]));
      for (const m of incoming) byId.set(m.id, m);
      return [...byId.values()];
    });
  }, []);

  const refresh = React.useCallback(async () => {
    try {
      const page = await request<Page>(endpoint);
      merge(page.messages);
      // Keep the cursor of deeper pages we already loaded.
      setNextToken((prev) => prev ?? page.nextToken);
      setStatus("ready");
      setError(null);
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Failed to load mail");
    }
  }, [endpoint, merge]);

  React.useEffect(() => {
    void refresh();
    if (!pollMs) return;
    const id = setInterval(() => void refresh(), pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs]);

  const loadMore = React.useCallback(async () => {
    if (!nextToken) return;
    try {
      const page = await request<Page>(
        `${endpoint}?cursor=${encodeURIComponent(nextToken)}`,
      );
      merge(page.messages);
      setNextToken(page.nextToken);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load more mail");
    }
  }, [endpoint, nextToken, merge]);

  const threads = React.useMemo(
    () =>
      local
        ? groupIntoThreads(applyReadState(messages, local), {
            state: local.threads,
          })
        : [],
    [messages, local],
  );

  const onAction = React.useCallback(
    (thread: Thread, action: ThreadAction) =>
      update((s) => reduceAction(s, thread, action)),
    [update],
  );
  const onLabel = React.useCallback(
    (thread: Thread, label: string, applied: boolean) =>
      update((s) => {
        const current = s.threads[thread.id]?.labels ?? thread.labels ?? [];
        const labels = applied
          ? [...new Set([...current, label])]
          : current.filter((l) => l !== label);
        return patchThread(s, thread.id, { labels });
      }),
    [update],
  );
  const onSnooze = React.useCallback(
    (thread: Thread, until: Date | null) =>
      update((s) =>
        patchThread(s, thread.id, {
          snoozedUntil: until?.toISOString() ?? null,
        } satisfies ThreadState),
      ),
    [update],
  );
  const onSend = React.useCallback(
    async (draft: Draft) => {
      await request<{ messageId: string }>(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      await refresh();
    },
    [endpoint, refresh],
  );

  return {
    /** Spread into `<Inbox />`. */
    inboxProps: { threads, onAction, onLabel, onSnooze, onSend },
    threads,
    status,
    error,
    hasMore: Boolean(nextToken),
    loadMore,
    refresh,
  };
}
