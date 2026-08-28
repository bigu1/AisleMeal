"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CookingVideoLink } from "@/components/CookingVideoLink";
import { EmptyState } from "@/components/EmptyState";
import { PageShell } from "@/components/PageShell";
import { ingredientsById, recipesById } from "@/domain/data";
import { shortNameOf } from "@/domain/displayName";
import { householdHintFromSteps } from "@/domain/householdHint";
import { enabledSlotsOf } from "@/domain/nutrition";
import type { MealSlot } from "@/domain/types";
import { EQUIPMENT_LABEL, SLOT_LABEL } from "@/lib/labels";
import { planDayIndex } from "@/lib/planDay";
import { useAppStore } from "@/store/useAppStore";

export default function CookPage() {
  return (
    <PageShell title="按餐开做">
      <Suspense
        fallback={
          <div className="h-40 animate-pulse rounded-2xl bg-[var(--color-surface-2)]" />
        }
      >
        <CookQueryBody />
      </Suspense>
    </PageShell>
  );
}

function parseDay(
  raw: string | null,
  days: number,
  planStartedOn: string | null,
): number {
  if (raw != null && raw !== "") {
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 0 && n < days) return n;
  }
  return planDayIndex(planStartedOn, days);
}

function parseSlot(raw: string | null): MealSlot | null {
  if (raw === "breakfast" || raw === "lunch" || raw === "dinner") return raw;
  return null;
}

function CookQueryBody() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const profile = useAppStore((s) => s.profile);
  const plan = useAppStore((s) => s.plan);
  const planStartedOn = useAppStore((s) => s.planStartedOn);

  const querySlot = parseSlot(searchParams.get("slot"));
  const selectedDay =
    plan?.feasible === true
      ? parseDay(searchParams.get("day"), plan.days, planStartedOn)
      : 0;

  useEffect(() => {
    if (!querySlot) return;
    document.getElementById(`cook-${querySlot}`)?.scrollIntoView({
      block: "start",
    });
  }, [querySlot, selectedDay]);

  if (!profile) {
    return (
      <EmptyState
        title="还没有身体档案"
        description="先建档，才能按餐跟做。"
        href="/onboarding"
        action="去建档"
      />
    );
  }

  if (!plan || plan.feasible === false) {
    return (
      <EmptyState
        title="还没有可行餐单"
        description="先选这周想吃的菜，再排出餐单。"
        href="/recipes"
        action="去选菜"
      />
    );
  }

  const day = Math.min(selectedDay, plan.days - 1);
  const byIng = ingredientsById();
  const byRec = recipesById();
  const extras = plan.microAdjust.filter((item) => item.day === day);

  return (
    <div className="space-y-4">
      <div className="flex w-full min-w-0 max-w-full flex-wrap gap-2">
        {Array.from({ length: plan.days }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => {
              const params = new URLSearchParams();
              params.set("day", String(i));
              if (querySlot) params.set("slot", querySlot);
              router.replace(`/cook?${params.toString()}`);
            }}
            className="min-h-11 shrink-0 rounded-xl px-3 text-sm"
            style={{
              background:
                i === day ? "var(--color-brand)" : "var(--color-surface-2)",
              color: i === day ? "#fff" : "var(--color-text)",
            }}
          >
            第 {i + 1} 天
          </button>
        ))}
      </div>

      {enabledSlotsOf(profile).map((slot) => {
        const meal = plan.meals.find((m) => m.day === day && m.slot === slot);
        if (!meal) return null;
        const recipe = byRec.get(meal.recipeId);
        if (!recipe) {
          return (
            <article
              key={slot}
              id={`cook-${slot}`}
              className="rounded-2xl border bg-[var(--color-surface)] p-3"
              style={{ borderColor: "var(--color-line)" }}
            >
              <p className="text-sm text-[var(--color-brand)]">{SLOT_LABEL[slot]}</p>
              <p className="mt-1 text-sm text-[var(--color-text)]">
                这道菜已下架，请回餐单重新排出
              </p>
            </article>
          );
        }
        const tools =
          recipe.equipment.length > 0
            ? recipe.equipment.map((eq) => EQUIPMENT_LABEL[eq]).join("、")
            : "免开火";
        return (
          <article
            key={slot}
            id={`cook-${slot}`}
            className="rounded-2xl border bg-[var(--color-surface)] p-3"
            style={{ borderColor: "var(--color-line)" }}
          >
            <p className="text-sm text-[var(--color-brand)]">{SLOT_LABEL[slot]}</p>
            <div className="mt-0.5 flex items-start justify-between gap-2">
              <h2 className="min-w-0 text-base font-semibold text-[var(--color-text)]">
                {recipe.name}
              </h2>
              <CookingVideoLink name={recipe.name}>教学视频</CookingVideoLink>
            </div>
            <p className="mt-1 text-sm text-[var(--color-text-2)]">
              {recipe.timeMinutes} 分钟 · {tools}
            </p>
            <ul className="mt-3 space-y-1 text-base text-[var(--color-text)]">
              {recipe.ingredients.map((item, index) => {
                const ingredient = byIng.get(item.id);
                const name = ingredient?.name ?? item.id;
                const hint = householdHintFromSteps(recipe.steps, [
                  ingredient ? shortNameOf(ingredient) : "",
                  name,
                ]);
                return (
                  <li key={`${item.id}-${index}`}>
                    {name} {item.grams}g
                    {hint ? ` · ${hint}` : ""}
                  </li>
                );
              })}
            </ul>
            <ol className="mt-4 space-y-3">
              {recipe.steps.map((step, i) => (
                <li
                  key={i}
                  className="flex min-w-0 gap-3 text-lg leading-snug text-[var(--color-text)]"
                >
                  <span className="w-6 shrink-0 font-bold text-[var(--color-brand)]">
                    {i + 1}
                  </span>
                  <span className="min-w-0 break-words">{step}</span>
                </li>
              ))}
            </ol>
          </article>
        );
      })}

      {extras.length > 0 ? (
        <section>
          <h2 className="mb-2 text-base font-semibold">今日加餐</h2>
          <div className="space-y-2">
            {extras.map((item, i) => {
              const name = byIng.get(item.ingredientId)?.name ?? item.ingredientId;
              return (
                <div
                  key={`${item.ingredientId}-${i}`}
                  className="rounded-2xl border p-3"
                  style={{
                    borderColor: "var(--color-line)",
                    background: "var(--color-surface-2)",
                  }}
                >
                  <p className="text-base font-medium">
                    {name} {item.grams}g
                  </p>
                  <p className="mt-0.5 text-sm text-[var(--color-text-2)]">{item.reason}</p>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
