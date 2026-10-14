import type { Message, Thread, ThreadAction, ThreadState } from "../types";

/**
 * Client-side mailbox state. The Wraps inbox bucket is read-only storage, so
 * read/archive/star/labels/snooze live here (persisted by a `StateStore`)
 * until you back them with your own API.
 */
export interface LocalState {
  /** ISO time of first load. Mail received before it counts as read. */
  baseline: string;
  /** Explicit per-message read state, by message id. */
  overrides: Record<string, "read" | "unread">;
  /** Per-thread state, by thread id. */
  threads: Record<string, ThreadState | undefined>;
}

export interface StateStore {
  load(): LocalState | null;
  save(state: LocalState): void;
}

export function emptyState(baseline: string): LocalState {
  return { baseline, overrides: {}, threads: {} };
}

/** Stamp `read` onto inbound messages from the baseline and overrides. */
export function applyReadState(
  messages: Message[],
  state: LocalState,
): Message[] {
  const baseline = Date.parse(state.baseline);
  return messages.map((m) => {
    const override = state.overrides[m.id];
    const read =
      override === "read" ||
      (override !== "unread" && Date.parse(m.date) <= baseline);
    return { ...m, read };
  });
}

export function patchThread(
  state: LocalState,
  threadId: string,
  patch: ThreadState,
): LocalState {
  return {
    ...state,
    threads: {
      ...state.threads,
      [threadId]: { ...state.threads[threadId], ...patch },
    },
  };
}

/** Apply a thread action. "unread" marks only the newest inbound message. */
export function reduceAction(
  state: LocalState,
  thread: Thread,
  action: ThreadAction,
): LocalState {
  switch (action) {
    case "read":
    case "unread": {
      const inbound = thread.messages.filter((m) => m.direction === "inbound");
      const overrides = { ...state.overrides };
      if (action === "read") {
        for (const m of inbound) overrides[m.id] = "read";
      } else {
        const last = inbound[inbound.length - 1];
        if (last) overrides[last.id] = "unread";
      }
      return { ...state, overrides };
    }
    case "archive":
      return patchThread(state, thread.id, { archived: true });
    case "unarchive":
      return patchThread(state, thread.id, { archived: false });
    case "star":
      return patchThread(state, thread.id, { starred: true });
    case "unstar":
      return patchThread(state, thread.id, { starred: false });
  }
}

export function localStorageStore(key: string): StateStore {
  return {
    load() {
      try {
        const raw = window.localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as LocalState) : null;
      } catch {
        return null;
      }
    },
    save(state) {
      try {
        window.localStorage.setItem(key, JSON.stringify(state));
      } catch {
        // Storage can be unavailable (private mode, quota); state is then
        // session-only.
      }
    },
  };
}
