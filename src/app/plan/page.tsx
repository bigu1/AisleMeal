"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DialogSheet } from "@/components/DialogSheet";
import { EmptyState } from "@/components/EmptyState";
import { DaysPicker } from "@/components/DaysPicker";
import { MacroBars, macroStatusLabel } from "@/components/MacroBars";
import { PageShell } from "@/components/PageShell";
import { PlanStyleSelector } from "@/components/PlanStyleSelector";
import { StoreSourceBanner } from "@/components/StoreSourceBanner";
import { resolveUniverse } from "@/domain/availability";
import { ingredients, ingredientsById, recipes, recipesById } from "@/domain/data";
import {
  computeTarget,
  enabledSlotsOf,
  planSlotBudget,
  recipeMacros,
  remainingTarget,
  roundMacros,
} from "@/domain/nutrition";
import { nutritionGate } from "@/domain/nutritionGate";
import { repairPlanToGate } from "@/domain/planRepair";
import {
  alternativesFor,
  cookableRecipes,
  createMealPlan,
  explainMealChoice,
  replaceMeal,
  summarizePlanDiversity,
  wantedChipBadge,
  type PlanContext,
} from "@/domain/planner";
import { buildShoppingList, flattenShoppingList } from "@/domain/shoppingList";
import type {
  InfeasiblePlan,
  MealPlan,
  MealSlot,
  PlanStyle,
  Recipe,
} from "@/domain/types";
import { shortNameOf } from "@/domain/displayName";
import { PLAN_STYLE_LABEL, SLOT_LABEL } from "@/lib/labels";
import {
  getActiveShoppingList,
  shoppingListBought,
  useAppStore,
} from "@/store/useAppStore";
import { sameShoppingSource } from "@/store/persistMigrate";

export default function PlanPage() {
  return (
    <PageShell title="餐单">
      <PlanBody />
    </PageShell>
  );
}

function PlanBody() {
  const router = useRouter();
  const profile = useAppStore((s) => s.profile);
  const plan = useAppStore((s) => s.plan);
  const basketIds = useAppStore((s) => s.basketIds);
  const customIngredients = useAppStore((s) => s.customIngredients);
  const days = useAppStore((s) => s.days);
  const planStyle = useAppStore((s) => s.planStyle);
  const wantedRecipeIds = useAppStore((s) => s.wantedRecipeIds);
  const toggleWanted = useAppStore((s) => s.toggleWanted);
  const setPlan = useAppStore((s) => s.setPlan);
  const setDays = useAppStore((s) => s.setDays);
  const patchPlan = useAppStore((s) => s.patchPlan);
  const setProgressStep = useAppStore((s) => s.setProgressStep);
  const commitShoppingSnapshot = useAppStore((s) => s.commitShoppingSnapshot);
  const dropOldestShoppingList = useAppStore((s) => s.dropOldestShoppingList);
  const shoppingLists = useAppStore((s) => s.shoppingLists);
  const activeShoppingListId = useAppStore((s) => s.activeShoppingListId);
  const planStartedOn = useAppStore((s) => s.planStartedOn);
  const [picker, setPicker] = useState<{ day: number; slot: MealSlot } | null>(
    null,
  );
  const [listSheet, setListSheet] = useState(false);
  const [infeasibleHint, setInfeasibleHint] = useState<InfeasiblePlan | null>(
    null,
  );
  const [repairFailed, setRepairFailed] = useState(false);

  if (!profile) {
    return (
      <EmptyState
        title="还没有身体档案"
        description="先建档，才能按你的目标排出三餐。"
        href="/onboarding"
        action="去建档"
      />
    );
  }

  const userProfile = profile;
  const target = computeTarget(userProfile);
  const budget = planSlotBudget(target, userProfile);
  const remaining = remainingTarget(target, budget);
  const byIng = ingredientsById();
  const byRec = recipesById();
  const universe = resolveUniverse(basketIds, customIngredients);
  const candidates = cookableRecipes(
    recipes,
    userProfile,
    ingredients,
    universe,
  );
  const cookableIds = new Set(candidates.map((recipe) => recipe.id));
  const ctx: PlanContext = {
    profile: userProfile,
    ingredients,
    universe,
    planStyle,
    wantedRecipeIds,
  };
  const feasible = plan?.feasible === true ? plan : null;
  const diversity = feasible ? summarizePlanDiversity(feasible) : null;
  const wantedAllUncookable =
    wantedRecipeIds.length > 0 &&
    wantedRecipeIds.every((id) => !cookableIds.has(id));
  const gate = feasible ? nutritionGate(feasible, remaining) : null;
  const activeList = getActiveShoppingList({
    shoppingLists,
    activeShoppingListId,
  });
  const listInSync =
    feasible &&
    activeList &&
    !activeList.stale &&
    sameShoppingSource(activeList, feasible, planStartedOn);

  function altsFor(day: number, slot: MealSlot): Recipe[] {
    if (!feasible) return [];
    return alternativesFor(feasible, day, slot, candidates, target, ctx);
  }

  function pickMeal(day: number, slot: MealSlot, recipeId: string) {
    if (!feasible) return;
    patchPlan(
      replaceMeal(
        feasible,
        day,
        slot,
        recipeId,
        candidates,
        target,
        ctx,
        recipes,
      ),
    );
    setPicker(null);
  }

  function applyRebuilt(
    rebuilt: ReturnType<typeof createMealPlan>,
    extra?: { planStyle?: PlanStyle },
  ) {
    setRepairFailed(false);
    if (rebuilt.feasible === false) {
      setInfeasibleHint(rebuilt);
      if (!feasible) setPlan(rebuilt, extra);
      return;
    }
    setInfeasibleHint(null);
    setPlan(rebuilt, extra);
  }

  function changeStyle(next: PlanStyle) {
    if (next === planStyle) return;
    if (!window.confirm("将按新偏好重排，已换的菜会丢掉")) {
      return;
    }
    applyRebuilt(
      createMealPlan(recipes, target, days, {
        ...ctx,
        planStyle: next,
      }),
      { planStyle: next },
    );
  }

  function rebuildVariety() {
    if (!window.confirm("按当前食材换花样重排，已换的菜会丢掉")) {
      return;
    }
    const rebuilt = createMealPlan(recipes, target, days, {
      ...ctx,
      planStyle: "variety",
    });
    if (rebuilt.feasible === false) {
      setInfeasibleHint(rebuilt);
      return;
    }
    setRepairFailed(false);
    setInfeasibleHint(null);
    setPlan(rebuilt, { planStyle: "variety" });
  }

  function generatePlan() {
    applyRebuilt(createMealPlan(recipes, target, days, ctx));
  }

  function oneClickRepair() {
    if (!feasible) return;
    const result = repairPlanToGate(feasible, recipes, target, ctx);
    if (!result.ok) {
      setRepairFailed(true);
      return;
    }
    const daysLabel = result.changedDays.map((day) => day + 1).join("、");
    const confirmText =
      result.changedDays.length > 0
        ? `将改第 ${daysLabel} 天的菜，使热量和蛋白落在 90%–110%。继续？`
        : "将按已选食材微调热量和蛋白。继续？";
    if (!window.confirm(confirmText)) return;
    patchPlan(result.plan);
    setRepairFailed(false);
  }

  function goShopping() {
    setProgressStep(4);
    router.push("/shopping");
  }

  function ensureListSlot(): boolean {
    if (shoppingLists.length < 8) return true;
    const oldest = [...shoppingLists].sort((a, b) => {
      if (a.updatedAt !== b.updatedAt) {
        return a.updatedAt.localeCompare(b.updatedAt);
      }
      return a.id.localeCompare(b.id);
    })[0];
    if (
      !window.confirm(`已有 8 份，删除最早的「${oldest.name}」并继续？`)
    ) {
      return false;
    }
    dropOldestShoppingList();
    return true;
  }

  function saveAsWithCap(): boolean {
    if (!ensureListSlot()) return false;
    return commitShoppingSnapshot("saveAs");
  }

  function changeDays(next: number) {
    if (next === days) return;
    if (plan && !window.confirm("将清空当前餐单")) return;
    setDays(next);
  }

  function generateList() {
    if (!gate || !gate.ok) return;
    if (!activeList) {
      if (!ensureListSlot()) return;
      if (!commitShoppingSnapshot("overwrite")) return;
      goShopping();
      return;
    }
    const bought = shoppingListBought(
      activeList,
      (id) => byIng.get(id)?.category,
    );
    if (bought) {
      if (saveAsWithCap()) goShopping();
      return;
    }
    setListSheet(true);
  }

  const pickerAlts = picker && feasible ? altsFor(picker.day, picker.slot) : [];
  const currentList = feasible
    ? flattenShoppingList(
        buildShoppingList(feasible, [], ingredients, recipes, days),
      )
    : [];

  return (
    <div className="space-y-4">
      <StoreSourceBanner />
      {universe.size === 0 ? (
        <p className="text-sm text-[var(--color-warn)]">
          还没勾食材，先去选手头有的。{" "}
          <Link href="/basket" className="text-[var(--color-brand)]">
            去选食材
          </Link>
        </p>
      ) : null}
      <PlanStyleSelector value={planStyle} onChange={changeStyle} />
      {wantedRecipeIds.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {wantedRecipeIds.map((id) => {
            const recipe = byRec.get(id);
            const badge = wantedChipBadge(
              id,
              cookableIds,
              plan,
              recipe?.mealSlots,
              enabledSlotsOf(userProfile),
            );
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => toggleWanted(id)}
                  className="min-h-11 rounded-xl border px-3 text-sm"
                  style={{ borderColor: "var(--color-line)" }}
                >
                  {recipe?.name ?? id}
                  {badge ? (
                    <span className="ml-1 text-xs text-[var(--color-warn)]">
                      {badge}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      <div id="plan-days">
        <DaysPicker value={days} onChange={changeDays} label="备几天" />
      </div>
      <button
        type="button"
        disabled={wantedAllUncookable}
        onClick={generatePlan}
        className="flex min-h-12 w-full items-center justify-center rounded-xl bg-[var(--color-brand)] text-base font-semibold text-white disabled:bg-[var(--color-surface-2)] disabled:text-[var(--color-text-3)]"
      >
        {wantedRecipeIds.length > 0
          ? `用这几道排出 ${days} 天`
          : `排出 ${days} 天`}
      </button>
      <p className="text-xs text-[var(--color-text-3)]">排出只做餐单，不买菜。</p>
      {(wantedRecipeIds.length === 0 && !feasible) || wantedAllUncookable ? (
        <Link
          href="/recipes"
          className="flex min-h-11 items-center justify-center text-base text-[var(--color-brand)]"
        >
          去选想吃的
        </Link>
      ) : null}
      {infeasibleHint ? (
        <div
          className="rounded-2xl border px-3 py-3 text-sm text-[var(--color-warn)]"
          style={{ borderColor: "var(--color-line)" }}
        >
          <p>
            排不出完整餐单
            {infeasibleHint.blockedSlots.length > 0
              ? `（缺${infeasibleHint.blockedSlots
                  .map((slot) => SLOT_LABEL[slot])
                  .join("、")}）`
              : ""}
            。
          </p>
          <div className="mt-2 flex gap-3">
            <Link href="/onboarding?edit=1" className="min-h-11 text-[var(--color-brand)]">
              改档案
            </Link>
            <Link href="/basket" className="min-h-11 text-[var(--color-brand)]">
              改我的食材
            </Link>
          </div>
        </div>
      ) : null}
      {feasible && diversity ? (
        <p className="text-base text-[var(--color-text-2)]">
          {PLAN_STYLE_LABEL[planStyle]} · {feasible.days} 天 · 不同菜{" "}
          {diversity.unique} · 重复 {diversity.repeatMeals}
        </p>
      ) : (
        <p className="text-sm text-[var(--color-text-2)]">
          还没有餐单。选几道想吃的，或直接排出。
        </p>
      )}

      {feasible
        ? Array.from({ length: feasible.days }, (_, day) => (
            <DayBlock
              key={day}
              day={day}
              plan={feasible}
              style={planStyle}
              slots={enabledSlotsOf(userProfile)}
              basketIds={basketIds}
              byIng={byIng}
              byRec={byRec}
              onOpen={(slot) => setPicker({ day, slot })}
            />
          ))
        : null}

      {feasible ? (
        <details
          className="rounded-2xl border bg-[var(--color-surface)] px-3 py-2"
          style={{ borderColor: "var(--color-line)" }}
        >
          <summary className="min-h-11 cursor-pointer text-base text-[var(--color-text-2)]">
            营养估算
          </summary>
          <div className="mt-2 space-y-3">
            {feasible.dailyActual.map((actual, day) => (
              <div key={day}>
                <p className="mb-1 text-sm font-medium">第 {day + 1} 天</p>
                <MacroBars actual={actual} target={remaining} />
                <p className="mt-1 text-xs text-[var(--color-text-2)]">
                  {budget.away.kcal > 0
                    ? "对照备餐目标（已扣除在外估计） · "
                    : ""}
                  {(["kcal", "protein", "fat", "carb"] as const)
                    .map((key) =>
                      macroStatusLabel(key, actual[key], remaining[key]),
                    )
                    .join(" · ")}
                </p>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      <Link
        href="/basket"
        className="flex min-h-11 items-center justify-center text-base text-[var(--color-brand)]"
      >
        改我的食材
      </Link>
      {feasible ? (
        <div
          className="sticky z-10 -mx-4 space-y-3 border-t bg-[var(--color-bg)] px-4 pt-3"
          style={{
            bottom: "calc(var(--bottom-nav) + env(safe-area-inset-bottom))",
            scrollMarginBottom: "5.5rem",
          }}
        >
          {gate && !gate.ok ? (
            <div
              className="rounded-2xl border px-3 py-3 text-sm text-[var(--color-warn)]"
              style={{ borderColor: "var(--color-line)" }}
            >
              <p>热量或蛋白还没落在备餐目标的 90%–110%。</p>
              {gate.reasons.map((reason) => (
                <p key={reason}>{reason}</p>
              ))}
              {enabledSlotsOf(userProfile).length >= 2 &&
              (remaining.kcal < 200 || remaining.protein < 10) ? (
                <p>在外热量填得太高，备餐目标过低。</p>
              ) : null}
              {repairFailed ? (
                <p>
                  这套菜凑不进 90%–110%，请改食材、改天数或改成换花样。
                </p>
              ) : null}
              <p>脂肪和碳水是参考，不挡住生成。</p>
              <div className="mt-2 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={oneClickRepair}
                  className="flex min-h-12 w-full items-center justify-center rounded-xl bg-[var(--color-brand)] text-base font-semibold text-white"
                >
                  一键调到能买
                </button>
                <button
                  type="button"
                  onClick={rebuildVariety}
                  className="flex min-h-12 w-full items-center justify-center rounded-xl border text-base font-semibold text-[var(--color-text)]"
                  style={{ borderColor: "var(--color-line)" }}
                >
                  按手头食材换花样重排
                </button>
                <div className="flex flex-wrap gap-3">
                  <Link
                    href="/onboarding?edit=1"
                    className="inline-flex min-h-11 items-center text-[var(--color-brand)]"
                  >
                    改档案
                  </Link>
                  <Link
                    href="/basket"
                    className="inline-flex min-h-11 items-center text-[var(--color-brand)]"
                  >
                    改食材
                  </Link>
                  <button
                    type="button"
                    onClick={() =>
                      document
                        .getElementById("plan-days")
                        ?.scrollIntoView({ block: "start" })
                    }
                    className="inline-flex min-h-11 items-center text-[var(--color-brand)]"
                  >
                    改天数
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          {listInSync ? (
            <Link
              href="/shopping"
              onClick={() => setProgressStep(4)}
              className="flex min-h-12 items-center justify-center rounded-xl bg-[var(--color-brand)] text-base font-semibold text-white"
            >
              打开买菜
            </Link>
          ) : (
            <button
              type="button"
              disabled={gate != null && !gate.ok}
              onClick={generateList}
              className="flex min-h-12 w-full items-center justify-center rounded-xl bg-[var(--color-brand)] text-base font-semibold text-white disabled:bg-[var(--color-surface-2)] disabled:text-[var(--color-text-3)]"
            >
              {activeList ? "清单已过期，重新生成" : "生成采购清单"}
            </button>
          )}
        </div>
      ) : null}

      {listSheet ? (
        <DialogSheet
          title="已有未买完的清单"
          titleId="list-save-title"
          onClose={() => setListSheet(false)}
        >
          <div className="space-y-2 px-4 py-3">
            <button
              type="button"
              onClick={() => {
                commitShoppingSnapshot("overwrite");
                setListSheet(false);
                goShopping();
              }}
              className="min-h-12 w-full rounded-xl bg-[var(--color-brand)] text-base font-semibold text-white"
            >
              覆盖当前
            </button>
            <button
              type="button"
              onClick={() => {
                if (saveAsWithCap()) {
                  setListSheet(false);
                  goShopping();
                }
              }}
              className="min-h-12 w-full rounded-xl border text-base"
              style={{ borderColor: "var(--color-line)" }}
            >
              另存为新清单
            </button>
          </div>
        </DialogSheet>
      ) : null}

      {picker && feasible ? (
        <SwapSheet
          day={picker.day}
          slot={picker.slot}
          alts={pickerAlts}
          current={feasible}
          currentList={currentList}
          target={target}
          remaining={remaining}
          ctx={ctx}
          candidates={candidates}
          byIng={byIng}
          onPick={(id) => pickMeal(picker.day, picker.slot, id)}
          onClose={() => setPicker(null)}
        />
      ) : null}
    </div>
  );
}

function DayBlock({
  day,
  plan,
  style,
  slots,
  basketIds,
  byIng,
  byRec,
  onOpen,
}: {
  day: number;
  plan: MealPlan;
  style: PlanStyle;
  slots: MealSlot[];
  basketIds?: string[];
  byIng: ReturnType<typeof ingredientsById>;
  byRec: ReturnType<typeof recipesById>;
  onOpen: (slot: MealSlot) => void;
}) {
  const extras = plan.microAdjust.filter((item) => item.day === day);
  const lunchId = plan.meals.find((m) => m.day === day && m.slot === "lunch")?.recipeId;
  const dinnerId = plan.meals.find((m) => m.day === day && m.slot === "dinner")?.recipeId;

  return (
    <section className="border-t pt-3" style={{ borderColor: "var(--color-line)" }}>
      <h2 className="mb-2 text-lg font-semibold text-[var(--color-text)]">
        第 {day + 1} 天
      </h2>
      <ul className="divide-y" style={{ borderColor: "var(--color-line)" }}>
        {slots.map((slot) => {
          const meal = plan.meals.find((m) => m.day === day && m.slot === slot);
          const recipe = meal ? byRec.get(meal.recipeId) : undefined;
          const reason = recipe
            ? explainMealChoice(
                recipe,
                day,
                slot,
                plan,
                style,
                basketIds,
                byIng,
              )
            : "";
          return (
            <li key={slot} className="flex min-h-11 items-start justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="text-sm text-[var(--color-brand)]">{SLOT_LABEL[slot]}</p>
                <h3 className="text-base font-semibold text-[var(--color-text)]">
                  {recipe?.name ?? meal?.recipeId ?? "—"}
                </h3>
                {recipe ? (
                  <p className="text-sm text-[var(--color-text-2)]">
                    {recipe.timeMinutes} 分钟
                    {slot === "dinner" && lunchId && lunchId === dinnerId
                      ? " · 复热午饭，不必重做"
                      : ""}
                  </p>
                ) : null}
                {reason ? (
                  <p className="text-sm text-[var(--color-text-2)]">{reason}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <button
                  type="button"
                  onClick={() => onOpen(slot)}
                  className="min-h-11 min-w-11 text-sm font-medium text-[var(--color-brand)]"
                >
                  换
                </button>
                <Link
                  href={`/cook?day=${day}&slot=${slot}`}
                  className="inline-flex min-h-11 min-w-11 items-center text-sm font-medium text-[var(--color-brand)]"
                >
                  去做
                </Link>
                <Link
                  href={`/recipes?replace=${day}-${slot}`}
                  className="inline-flex min-h-11 min-w-11 items-center text-sm text-[var(--color-text-2)]"
                >
                  灵感
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
      {extras.length > 0 ? (
        <ul className="mt-2 space-y-1 text-sm text-[var(--color-text-2)]">
          {extras.map((item, i) => {
            const ing = byIng.get(item.ingredientId);
            const name = ing ? shortNameOf(ing) : item.ingredientId;
            return (
              <li key={`${item.ingredientId}-${i}`}>
                ＋{name} {item.grams}g，{item.reason}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

function SwapSheet({
  day,
  slot,
  alts,
  current,
  currentList,
  target,
  remaining,
  ctx,
  candidates,
  byIng,
  onPick,
  onClose,
}: {
  day: number;
  slot: MealSlot;
  alts: Recipe[];
  current: MealPlan;
  currentList: ReturnType<typeof flattenShoppingList>;
  target: ReturnType<typeof computeTarget>;
  remaining: ReturnType<typeof remainingTarget>;
  ctx: PlanContext;
  candidates: Recipe[];
  byIng: ReturnType<typeof ingredientsById>;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const oldById = useMemo(
    () => new Map(currentList.map((line) => [line.ingredientId, line])),
    [currentList],
  );

  return (
    <DialogSheet
      title={`换一道 · ${SLOT_LABEL[slot]} · 第 ${day + 1} 天`}
      titleId="swap-meal-title"
      onClose={onClose}
    >
      <ul className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {alts.length === 0 ? (
          <li className="text-sm text-[var(--color-text-2)]">没有可换的菜</li>
        ) : (
          alts.map((recipe) => {
            const next = replaceMeal(
              current,
              day,
              slot,
              recipe.id,
              candidates,
              target,
              ctx,
              recipes,
            );
            const macros = roundMacros(recipeMacros(recipe, byIng));
            const actual = next.dailyActual[day];
            const pRatio = actual.protein / (remaining.protein || 1);
            const kRatio = actual.kcal / (remaining.kcal || 1);
            const nutrition =
              Math.abs(pRatio - 1) < 0.08
                ? "蛋白更接近"
                : kRatio > 1.1
                  ? "热量偏高"
                  : "相近";
            const nextList = flattenShoppingList(
              buildShoppingList(next, [], ingredients, recipes, current.days),
            );
            const added = nextList.filter((line) => !oldById.has(line.ingredientId));
            const packUp = nextList.filter((line) => {
              const prev = oldById.get(line.ingredientId);
              return prev != null && line.packs > prev.packs;
            });
            const packDown = nextList.filter((line) => {
              const prev = oldById.get(line.ingredientId);
              return prev != null && line.packs < prev.packs;
            });
            const removed = currentList.filter(
              (line) => !nextList.some((row) => row.ingredientId === line.ingredientId),
            );
            let shop = "采购不变";
            if (added.length > 0) {
              const shown = added.slice(0, 2).map((line) => {
                const ing = byIng.get(line.ingredientId);
                return ing ? shortNameOf(ing) : line.ingredientId;
              });
              shop = `多买${shown.join("、")}${added.length > 2 ? "等" : ""}`;
            } else if (packUp.length > 0) {
              const line = packUp[0];
              const ing = byIng.get(line.ingredientId);
              const prev = oldById.get(line.ingredientId)!;
              shop = `${ing ? shortNameOf(ing) : line.ingredientId}多买 ${line.packs - prev.packs}${ing?.pack.label ?? ""}`;
            } else if (packDown.length > 0 || removed.length > 0) {
              shop = "采购减少";
            }
            return (
              <li key={recipe.id}>
                <button
                  type="button"
                  onClick={() => onPick(recipe.id)}
                  className="mb-2 min-h-11 w-full rounded-xl border px-3 py-2 text-left"
                  style={{ borderColor: "var(--color-line)" }}
                >
                  <span className="block text-base font-semibold text-[var(--color-text)]">
                    {recipe.name}
                  </span>
                  <span className="mt-0.5 block text-sm text-[var(--color-text-2)]">
                    {recipe.timeMinutes} 分钟 · {macros.kcal} kcal · {nutrition} · {shop}
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>
      <div className="border-t px-4 py-3" style={{ borderColor: "var(--color-line)" }}>
        <button
          type="button"
          onClick={onClose}
          className="min-h-12 w-full rounded-xl bg-[var(--color-surface-2)] text-sm"
        >
          取消
        </button>
      </div>
    </DialogSheet>
  );
}
