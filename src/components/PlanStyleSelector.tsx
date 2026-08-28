"use client";

import type { KeyboardEvent } from "react";
import type { PlanStyle } from "@/domain/types";

const OPTIONS: PlanStyle[] = ["easy", "variety"];

export function PlanStyleSelector({
  value,
  onChange,
  disabled,
}: {
  value: PlanStyle;
  onChange: (style: PlanStyle) => void;
  disabled?: boolean;
}) {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    const idx = OPTIONS.indexOf(value);
    let next = value;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      next = OPTIONS[Math.min(OPTIONS.length - 1, idx + 1)];
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      next = OPTIONS[Math.max(0, idx - 1)];
    } else {
      return;
    }
    onChange(next);
    const group = event.currentTarget;
    requestAnimationFrame(() => {
      const selected = group.querySelector<HTMLElement>('[aria-checked="true"]');
      selected?.focus();
    });
  }

  return (
    <div
      role="radiogroup"
      aria-label="排餐偏好"
      className="grid grid-cols-2 gap-2"
      onKeyDown={onKeyDown}
    >
      {(
        [
          ["easy", "省事", "件数少、可重复、适合备餐"],
          ["variety", "换花样", "营养相近时换菜，候选不够仍生成"],
        ] as const
      ).map(([style, label, hint]) => {
        const selected = value === style;
        return (
          <button
            key={style}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            disabled={disabled}
            data-style={style}
            onClick={() => onChange(style)}
            className="min-h-12 rounded-xl border px-3 py-2 text-left disabled:opacity-60"
            style={{
              borderColor: selected
                ? style === "variety"
                  ? "var(--color-accent)"
                  : "var(--color-brand)"
                : "var(--color-line)",
              background: selected ? "var(--color-surface)" : "var(--color-surface-2)",
            }}
          >
            <span className="block text-base font-semibold text-[var(--color-text)]">
              {label}
            </span>
            <span className="mt-0.5 block text-xs text-[var(--color-text-2)]">
              {hint}
            </span>
          </button>
        );
      })}
    </div>
  );
}
