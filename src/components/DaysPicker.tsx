"use client";

import type { KeyboardEvent } from "react";
import { DAY_OPTIONS } from "@/lib/days";

export function DaysPicker({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (days: number) => void;
  label: string;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-[var(--color-text)]">{label}</p>
      <div
        role="radiogroup"
        aria-label={label}
        className="flex flex-wrap gap-1"
        onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
          const idx = DAY_OPTIONS.indexOf(value as (typeof DAY_OPTIONS)[number]);
          let next = value;
          if (event.key === "ArrowRight" || event.key === "ArrowDown") {
            event.preventDefault();
            next =
              DAY_OPTIONS[Math.min(DAY_OPTIONS.length - 1, Math.max(0, idx) + 1)];
          } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
            event.preventDefault();
            next = DAY_OPTIONS[Math.max(0, idx - 1)];
          } else {
            return;
          }
          onChange(next);
          const group = event.currentTarget;
          requestAnimationFrame(() => {
            group.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
          });
        }}
      >
        {DAY_OPTIONS.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            tabIndex={value === n ? 0 : -1}
            data-day={n}
            onClick={() => onChange(n)}
            className="min-h-11 flex-1 rounded-xl text-sm"
            style={{
              background:
                value === n ? "var(--color-brand)" : "var(--color-surface)",
              color: value === n ? "#fff" : "var(--color-text)",
              border: "1px solid var(--color-line)",
            }}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
