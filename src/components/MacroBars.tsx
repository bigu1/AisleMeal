"use client";

import { displayTone, type DisplayTone } from "@/domain/nutrition";
import type { Macros } from "@/domain/types";

const ROWS: { key: keyof Macros; label: string; unit: string }[] = [
  { key: "kcal", label: "热量", unit: "kcal" },
  { key: "protein", label: "蛋白", unit: "g" },
  { key: "fat", label: "脂肪（参考）", unit: "g" },
  { key: "carb", label: "碳水（参考）", unit: "g" },
];

const TONE_COLOR: Record<DisplayTone, string> = {
  ok: "var(--color-ok)",
  warn: "var(--color-warn)",
  danger: "var(--color-danger)",
};

export function barTone(actual: number, target: number): DisplayTone {
  return displayTone(actual, target);
}

export function macroStatusLabel(
  key: keyof Macros,
  actual: number,
  target: number,
): string {
  const row = ROWS.find((item) => item.key === key);
  const label = row?.label ?? key;
  const tone = displayTone(actual, target);
  if (tone === "ok") return `${label}在目标范围内`;
  const ratio = actual / (target || 1);
  const low = ratio < 1;
  if (tone === "warn") {
    return low ? `${label}偏低（勉强）` : `${label}偏高（勉强）`;
  }
  return low ? `${label}明显偏低` : `${label}明显偏高`;
}

export function MacroBars({
  actual,
  target,
}: {
  actual: Macros;
  target: Macros;
}) {
  return (
    <div className="space-y-2">
      {ROWS.map((row) => {
        const value = actual[row.key];
        const goal = target[row.key] || 1;
        const pct = Math.min(150, (value / goal) * 100);
        const tone = barTone(value, goal);
        return (
          <div key={row.key}>
            <div
              className="mb-0.5 flex justify-between text-xs"
              style={{ color: "var(--color-text-2)" }}
            >
              <span>{row.label}</span>
              <span>
                {Math.round(value)} / {Math.round(goal)} {row.unit}
              </span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full"
              style={{ background: "var(--color-surface-2)" }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${pct}%`,
                  background: TONE_COLOR[tone],
                  transition: "width 180ms",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
