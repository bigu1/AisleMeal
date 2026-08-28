"use client";

import Link from "next/link";
import { Clock } from "lucide-react";
import type { Macros, MealSlot, Recipe } from "@/domain/types";
import { EQUIPMENT_LABEL, SLOT_LABEL } from "@/lib/labels";

export function RecipeCard({
  recipe,
  macros,
  missingCount,
  missingLabel,
  replace,
  wanted,
  onToggleWanted,
  joinDisabled,
}: {
  recipe: Recipe;
  macros: Macros;
  missingCount?: number;
  missingLabel?: string;
  replace?: { day: number; slot: MealSlot };
  wanted?: boolean;
  onToggleWanted?: () => void;
  joinDisabled?: boolean;
}) {
  const href = replace
    ? `/recipes/${recipe.id}?replace=${replace.day}-${replace.slot}`
    : `/recipes/${recipe.id}`;
  const compatible =
    missingLabel ??
    (missingCount == null
      ? null
      : missingCount === 0
        ? "可做"
        : `还缺 ${missingCount}`);
  const showJoin = onToggleWanted != null && !replace;
  return (
    <article
      className="flex min-w-0 items-stretch gap-2 rounded-2xl border bg-[var(--color-surface)] p-3"
      style={{ borderColor: "var(--color-line)" }}
    >
      <Link href={href} className="min-w-0 flex-1">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <h3 className="min-w-0 break-words text-base font-semibold text-[var(--color-text)]">
            {recipe.name}
          </h3>
          <span className="flex shrink-0 items-center gap-1 text-sm text-[var(--color-text-2)]">
            <Clock size={14} />
            {recipe.timeMinutes} 分钟
          </span>
        </div>
        {compatible ? (
          <p
            className="mt-1 text-xs"
            style={{
              color:
                missingCount === 0 ? "var(--color-brand)" : "var(--color-accent)",
            }}
          >
            {compatible}
            {replace
              ? ` · 替换第 ${replace.day + 1} 天${SLOT_LABEL[replace.slot]}`
              : ""}
          </p>
        ) : null}
        <p className="mt-1 text-sm text-[var(--color-text-2)]">
          {recipe.equipment.length > 0
            ? recipe.equipment.map((item) => EQUIPMENT_LABEL[item]).join(" ")
            : "免开火"}
        </p>
        <p className="mt-0.5 text-sm tabular-nums text-[var(--color-text-3)]">
          {Math.round(macros.kcal)} kcal · 蛋白 {Math.round(macros.protein)}g
        </p>
      </Link>
      {showJoin ? (
        <button
          type="button"
          disabled={joinDisabled}
          onClick={onToggleWanted}
          className="shrink-0 self-center rounded-xl px-2 py-2 text-xs font-semibold disabled:opacity-50"
          style={{
            background: wanted
              ? "var(--color-surface-2)"
              : "var(--color-brand)",
            color: wanted ? "var(--color-text)" : "#fff",
            minHeight: "44px",
          }}
        >
          {wanted ? "已加入" : "加入本周"}
        </button>
      ) : null}
    </article>
  );
}
