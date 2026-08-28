"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/EmptyState";
import { MacroBars } from "@/components/MacroBars";
import { PageShell } from "@/components/PageShell";
import { ingredientsById, recipesById } from "@/domain/data";
import {
  addMacros,
  computeTarget,
  emptyMacros,
  enabledSlotsOf,
  firstEnabledSlot,
  planSlotBudget,
} from "@/domain/nutrition";
import { summarizePlanDiversity } from "@/domain/planner";
import type { MealSlot } from "@/domain/types";
import { SLOT_LABEL } from "@/lib/labels";
import { planDayIndex, planWeekdayLabel } from "@/lib/planDay";
import { isUsableShoppingList } from "@/store/persistMigrate";
import {
  getActiveShoppingList,
  isShoppingItemChecked,
  shoppingListBought,
  useAppStore,
} from "@/store/useAppStore";

export default function HomePage() {
  return <HomeReady />;
}

function primaryCta(args: {
  hasPlan: boolean;
  hasList: boolean;
  shoppingDone: boolean;
  dayIdx: number;
  nextSlot: MealSlot;
}): { href: string; label: string } {
  if (!args.hasPlan) return { href: "/recipes", label: "去选菜" };
  if (!args.hasList) return { href: "/plan", label: "去餐单生成清单" };
  if (!args.shoppingDone) return { href: "/shopping", label: "去买菜" };
  return {
    href: `/cook?day=${args.dayIdx}&slot=${args.nextSlot}`,
    label: `去做${SLOT_LABEL[args.nextSlot]}`,
  };
}

function HomeReady() {
  const router = useRouter();
  const profile = useAppStore((s) => s.profile);
  const plan = useAppStore((s) => s.plan);
  const planStartedOn = useAppStore((s) => s.planStartedOn);
  const shoppingLists = useAppStore((s) => s.shoppingLists);
  const activeShoppingListId = useAppStore((s) => s.activeShoppingListId);
  const resetAll = useAppStore((s) => s.resetAll);

  if (!profile) {
    return (
      <PageShell>
        <div className="space-y-4">
          <h1 className="text-[28px] font-semibold leading-[34px] text-[var(--color-text)]">
            货架健餐
          </h1>
          <p className="text-base leading-6 text-[var(--color-text)]">
            先勾手头有的食材，再选想吃的菜，排出三餐
          </p>
          <Link
            href="/onboarding"
            className="flex min-h-12 items-center justify-center rounded-xl bg-[var(--color-brand)] text-base font-semibold text-white"
          >
            开始建档
          </Link>
          <Link
            href="/recipes"
            className="flex min-h-11 items-center justify-center text-base text-[var(--color-text-2)]"
          >
            先看看菜谱灵感
          </Link>
          <p className="text-xs text-[var(--color-text-3)]">
            约 2 分钟。数据只留本机。营养是估算，不是医疗建议。
          </p>
        </div>
      </PageShell>
    );
  }

  const target = computeTarget(profile);
  const feasible = plan?.feasible === true ? plan : null;
  const dayIdx = feasible
    ? planDayIndex(planStartedOn, feasible.days)
    : 0;
  const byRec = recipesById();
  const byIng = ingredientsById();
  const activeList = getActiveShoppingList({
    shoppingLists,
    activeShoppingListId,
  });
  const usableList = isUsableShoppingList(
    activeList,
    feasible,
    planStartedOn,
  )
    ? activeList
    : undefined;
  const listItems = usableList?.items ?? [];
  const buyLines = listItems.filter(
    (line) => byIng.get(line.ingredientId)?.category !== "seasoning",
  );
  const checkedCount = buyLines.filter((line) =>
    isShoppingItemChecked(usableList, line.ingredientId),
  ).length;
  const shoppingDone = usableList
    ? shoppingListBought(usableList, (id) => byIng.get(id)?.category)
    : false;
  const budget = planSlotBudget(target, profile);
  const cta = primaryCta({
    hasPlan: Boolean(feasible),
    hasList: Boolean(usableList),
    shoppingDone,
    dayIdx,
    nextSlot: firstEnabledSlot(profile),
  });
  const diversity = feasible ? summarizePlanDiversity(feasible) : null;
  const todayMeals = feasible
    ? enabledSlotsOf(profile).map((slot) => {
        const meal = feasible.meals.find((row) => row.day === dayIdx && row.slot === slot);
        return { slot, meal, recipe: meal ? byRec.get(meal.recipeId) : undefined };
      })
    : [];
  const lunchId = todayMeals.find((row) => row.slot === "lunch")?.meal?.recipeId;
  const dinnerId = todayMeals.find((row) => row.slot === "dinner")?.meal?.recipeId;

  return (
    <PageShell>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-[22px] font-semibold leading-7 text-[var(--color-text)]">
            今天
          </h1>
          <Link
            href="/onboarding?edit=1"
            className="inline-flex min-h-11 items-center text-base text-[var(--color-text-2)]"
          >
            档案
          </Link>
        </div>
        {feasible ? (
          <p className="text-base text-[var(--color-text-2)]">
            {planWeekdayLabel(planStartedOn, dayIdx)} · 第 {dayIdx + 1}/{feasible.days}{" "}
            天
            {diversity
              ? ` · 不同菜 ${diversity.unique} · 重复 ${diversity.repeatMeals}`
              : ""}
          </p>
        ) : null}

        {!feasible ? (
          <EmptyState
            title="还没有可行餐单"
            description="先选这周想吃的菜，再排出餐单。"
            href="/recipes"
            action="去选菜"
          />
        ) : (
          <ul
            className="divide-y rounded-2xl border bg-[var(--color-surface)]"
            style={{ borderColor: "var(--color-line)" }}
          >
            {todayMeals.map((row) => (
              <li key={row.slot} className="px-3 py-3">
                <p className="text-sm text-[var(--color-brand)]">
                  {SLOT_LABEL[row.slot]}
                </p>
                <p className="text-base font-semibold text-[var(--color-text)]">
                  {row.recipe?.name ?? row.meal?.recipeId ?? "—"}
                </p>
                {row.recipe ? (
                  <p className="text-sm text-[var(--color-text-2)]">
                    {row.recipe.timeMinutes} 分钟
                    {row.slot === "dinner" && lunchId && lunchId === dinnerId
                      ? " · 复热午饭，不必重做"
                      : ""}
                  </p>
                ) : null}
                <Link
                  href={`/cook?day=${dayIdx}&slot=${row.slot}`}
                  className="mt-1 inline-flex min-h-11 min-w-11 items-center text-sm font-semibold text-[var(--color-brand)]"
                >
                  去做{SLOT_LABEL[row.slot]}
                </Link>
              </li>
            ))}
          </ul>
        )}

        {feasible && usableList ? (
          <p className="text-base text-[var(--color-text-2)]">
            买菜 {checkedCount}/{buyLines.length}
            {listItems.find((line) => line.storageHint?.includes("冷冻"))
              ? " · 优先冷冻"
              : ""}
          </p>
        ) : null}

        {target.clampedToFloor ? (
          <p className="rounded-xl bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-warn)]">
            已触发热量安全下限，建议咨询专业人士
          </p>
        ) : null}

        <Link
          href={cta.href}
          className="flex min-h-12 items-center justify-center rounded-xl bg-[var(--color-brand)] text-base font-semibold text-white"
        >
          {cta.label}
        </Link>

        <details className="rounded-2xl border bg-[var(--color-surface)] px-3 py-2"
          style={{ borderColor: "var(--color-line)" }}
        >
          <summary className="min-h-11 cursor-pointer text-base text-[var(--color-text-2)]">
            营养估算
          </summary>
          <div className="mt-2">
            <MacroBars
              actual={
                feasible
                  ? addMacros(
                      feasible.dailyActual[dayIdx] ?? emptyMacros(),
                      budget.away,
                    )
                  : target
              }
              target={target}
            />
            {budget.away.kcal > 0 ? (
              <p className="mt-2 text-xs text-[var(--color-text-2)]">
                含在外估计 {Math.round(budget.away.kcal)} kcal ·
                蛋白脂肪碳水均为估计
              </p>
            ) : null}
          </div>
        </details>

        <div className="flex justify-between gap-3 text-base">
          <Link href="/basket" className="inline-flex min-h-11 items-center text-[var(--color-brand)]">
            改我的食材
          </Link>
          <Link href="/recipes" className="inline-flex min-h-11 items-center text-[var(--color-text-2)]">
            菜谱灵感
          </Link>
          <button
            type="button"
            className="inline-flex min-h-11 items-center text-[var(--color-text-3)]"
            onClick={() => {
              if (
                !window.confirm(
                  "重新建档会清空本机餐单、清单和档案，确定？",
                )
              ) {
                return;
              }
              resetAll();
              router.push("/onboarding");
            }}
          >
            重新建档
          </button>
        </div>
      </div>
    </PageShell>
  );
}
