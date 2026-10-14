"use client";

import * as React from "react";
import { Inbox } from "@/registry/inbox/inbox";
import { mockThreads } from "@/registry/inbox/mock";

// Threads are owned by the parent: opening one marks it read here.
export function DemoInbox() {
  const [threads, setThreads] = React.useState(mockThreads);
  return (
    <Inbox
      threads={threads}
      onOpenThread={(thread) =>
        setThreads((all) =>
          all.map((t) => (t.id === thread.id ? { ...t, unread: false } : t)),
        )
      }
      onSend={async (draft) => {
        console.log("send", draft);
      }}
    />
  );
}
