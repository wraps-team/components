"use client";

import * as React from "react";
import { Inbox } from "@/registry/inbox/inbox";
import { MOCK_NOW, mockMessages, mockState } from "@/registry/inbox/mock";
import { groupIntoThreads } from "@/registry/inbox/thread";
import type { Thread, ThreadAction, ThreadState } from "@/registry/inbox/types";

// This is the whole adapter story: your backend holds flat messages and
// per-thread state; groupIntoThreads derives what the UI renders, and
// onAction writes back.
export function DemoInbox() {
  const [messages, setMessages] = React.useState(mockMessages);
  const [state, setState] = React.useState(mockState);
  const threads = React.useMemo(
    () => groupIntoThreads(messages, { state }),
    [messages, state],
  );

  function onAction(thread: Thread, action: ThreadAction) {
    if (action === "read" || action === "unread") {
      const lastInbound = [...thread.messages]
        .reverse()
        .find((m) => m.direction === "inbound");
      const ids = new Set(thread.messages.map((m) => m.id));
      setMessages((all) =>
        all.map((m) => {
          if (!ids.has(m.id) || m.direction !== "inbound") return m;
          if (action === "read") return { ...m, read: true };
          return { ...m, read: m.id === lastInbound?.id ? false : m.read };
        }),
      );
      return;
    }
    const patch: ThreadState =
      action === "archive"
        ? { archived: true }
        : action === "unarchive"
          ? { archived: false }
          : { starred: action === "star" };
    setState((s) => ({ ...s, [thread.id]: { ...s[thread.id], ...patch } }));
  }

  return (
    <Inbox
      threads={threads}
      now={MOCK_NOW}
      onAction={onAction}
      onSend={async (draft) => {
        console.log("send", draft);
      }}
    />
  );
}
