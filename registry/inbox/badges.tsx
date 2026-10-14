"use client";

import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFormattedDate } from "./format";

export function LabelChips({
  labels,
  className,
}: {
  labels?: string[];
  className?: string;
}) {
  if (!labels?.length) return null;
  return (
    <ul className={cn("flex flex-wrap gap-1", className)}>
      {labels.map((label) => (
        <li
          key={label}
          className="rounded-full border px-2 text-[10px] leading-4 text-muted-foreground"
        >
          {label}
        </li>
      ))}
    </ul>
  );
}

export function SnoozeBadge({
  until,
  className,
}: {
  until: string;
  className?: string;
}) {
  const when = useFormattedDate(until, "full");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[10px] leading-4 text-muted-foreground",
        className,
      )}
    >
      <Clock className="size-3" />
      Snoozed until {when}
    </span>
  );
}
