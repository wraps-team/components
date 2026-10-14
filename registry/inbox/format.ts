"use client";

import * as React from "react";

export type DateStyle = "list" | "full";

// First render (server and hydration) is deterministic — fixed locale, UTC —
// so it matches across environments. After mount we switch to the viewer's
// locale and timezone.
function format(iso: string, style: DateStyle, local: boolean): string {
  const date = new Date(iso);
  const locale = local ? undefined : "en-US";
  const timeZone = local ? undefined : "UTC";
  if (style === "full") {
    return date.toLocaleString(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
    });
  }
  if (local && date.toDateString() === new Date().toDateString()) {
    return date.toLocaleTimeString(locale, {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return date.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    timeZone,
  });
}

export function useFormattedDate(iso: string, style: DateStyle): string {
  const [text, setText] = React.useState(() => format(iso, style, false));
  React.useEffect(() => {
    setText(format(iso, style, true));
  }, [iso, style]);
  return text;
}
