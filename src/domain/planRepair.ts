import {
  addMacros,
  emptyMacros,
  enabledSlotsOf,
  planSlotBudget,
  recipeMacros,
  remainingTarget,
  TARGET_BAND,
} from "./nutrition";
import { nutritionGate } from "./nutritionGate";
import {
  alternativesFor,
  applyMicroAdjust,
  cookableRecipes,
  recomputeMicroAdjust,
  type PlanContext,
} from "./planner";
import type {
  Ingredient,
  Macros,
  MealPlan,
  MealSlot,
  NutritionTarget,
  Recipe,
  UserProfile,
} from "./types";

const STUFFING_IDS = new Set(["chicken-feet"]);
const MAX_OPTIONS_PER_SLOT = 12;

export interface PlanRepairResult {
  plan: MealPlan;
  ok: boolean;
  changedDays: number[];
}

function remainingOf(target: NutritionTarget, profile: UserProfile) {
  return remainingTarget(target, planSlotBudget(target, profile));
}

function ratioGap(actual: number, target: number): number {
  if (target <= 0) return actual > 0 ? 1 : 0;
  const ratio = actual / target;
  if (ratio < TARGET_BAND.lo) return TARGET_BAND.lo - ratio;
  if (ratio > TARGET_BAND.hi) return ratio - TARGET_BAND.hi;
  return 0;
}

function dayScore(actual: Macros, remaining: NutritionTarget): number {
  const kg = ratioGap(actual.kcal, remaining.kcal);
  const pg = ratioGap(actual.protein, remaining.protein);
  const kRatio = remaining.kcal > 0 ? actual.kcal / remaining.kcal : 0;
  const pRatio = remaining.protein > 0 ? actual.protein / remaining.protein : 0;
  if (kg === 0 && pg === 0) {
    return Math.abs(kRatio - 1) + Math.abs(pRatio - 1);
  }
  const kcalLow = kg > 0 && kRatio < TARGET_BAND.lo ? 1.5 : 0;
  const proteinLow = pg > 0 && pRatio < TARGET_BAND.lo ? 1.5 : 0;
  return 10 + kg * 2 + pg * 2 + kcalLow + proteinLow;
}

function hasStuffing(recipe: Recipe): boolean {
  return recipe.ingredients.some((row) => STUFFING_IDS.has(row.id));
}

function mealOf(plan: MealPlan, day: number, slot: MealSlot) {
  return plan.meals.find((meal) => meal.day === day && meal.slot === slot);
}

function changedDaySet(before: MealPlan, after: MealPlan): number[] {
  const days = new Set<number>();
  for (const meal of after.meals) {
    const prev = mealOf(before, meal.day, meal.slot);
    if (prev && prev.recipeId !== meal.recipeId) days.add(meal.day);
  }
  return [...days].sort((a, b) => a - b);
}

function mealsOnlyActual(
  meals: MealPlan["meals"],
  days: number,
  allRecipes: Recipe[],
  ingredients: PlanContext["ingredients"],
): Macros[] {
  const byId = new Map(ingredients.map((item) => [item.id, item]));
  const recipeMap = new Map(allRecipes.map((recipe) => [recipe.id, recipe]));
  const daily = Array.from({ length: days }, () => emptyMacros());
  for (const meal of meals) {
    const recipe = recipeMap.get(meal.recipeId);
    if (!recipe) continue;
    daily[meal.day] = addMacros(daily[meal.day], recipeMacros(recipe, byId));
  }
  return daily;
}

function rebuild(
  plan: MealPlan,
  meals: MealPlan["meals"],
  allRecipes: Recipe[],
  target: NutritionTarget,
  ctx: PlanContext,
): MealPlan {
  const dailyActual = mealsOnlyActual(
    meals,
    plan.days,
    allRecipes,
    ctx.ingredients,
  );
  return applyMicroAdjust(
    { ...plan, meals, dailyActual, microAdjust: [], feasible: true },
    target,
    ctx,
  );
}

function pickSlotOptions(
  current: Recipe | undefined,
  alts: Recipe[],
  wanted: Set<string>,
  byId: Map<string, Ingredient>,
): Recipe[] {
  const pool = alts.filter((recipe) => !hasStuffing(recipe));
  const picked = new Map<string, Recipe>();
  if (current && !hasStuffing(current)) picked.set(current.id, current);
  for (const recipe of pool) {
    if (wanted.has(recipe.id)) picked.set(recipe.id, recipe);
  }
  const withMacros = pool.map((recipe) => ({
    recipe,
    macros: recipeMacros(recipe, byId),
  }));
  const byProtein = [...withMacros].sort(
    (a, b) => a.macros.protein - b.macros.protein,
  );
  const byKcal = [...withMacros].sort((a, b) => a.macros.kcal - b.macros.kcal);
  const take = (rows: typeof withMacros, reverse: boolean) => {
    const seq = reverse ? [...rows].reverse() : rows;
    for (const row of seq) {
      if (picked.size >= MAX_OPTIONS_PER_SLOT) return;
      picked.set(row.recipe.id, row.recipe);
    }
  };
  take(byProtein, false);
  take(byProtein, true);
  take(byKcal, false);
  take(byKcal, true);
  return [...picked.values()];
}

function searchDay(
  plan: MealPlan,
  day: number,
  slots: MealSlot[],
  candidates: Recipe[],
  allRecipes: Recipe[],
  target: NutritionTarget,
  ctx: PlanContext,
  remaining: NutritionTarget,
  wanted: Set<string>,
  pinWanted: boolean,
): MealPlan {
  const byId = new Map(ctx.ingredients.map((item) => [item.id, item]));
  const recipeMap = new Map(allRecipes.map((recipe) => [recipe.id, recipe]));
  const options = slots.map((slot) => {
    const currentId = mealOf(plan, day, slot)?.recipeId;
    const current = currentId ? recipeMap.get(currentId) : undefined;
    const alts = alternativesFor(plan, day, slot, candidates, target, ctx);
    if (
      pinWanted &&
      current &&
      wanted.has(current.id) &&
      !hasStuffing(current)
    ) {
      return [current];
    }
    const picked = pickSlotOptions(current, alts, wanted, byId);
    if (picked.length > 0) return picked;
    return current ? [current] : [];
  });
  if (options.every((list) => list.length === 0)) return plan;

  let best = plan;
  let bestScore = dayScore(
    plan.dailyActual[day] ?? emptyMacros(),
    remaining,
  );

  const pick: string[] = [];
  const dfs = (index: number) => {
    if (index === slots.length) {
      const meals = plan.meals.map((meal) => {
        if (meal.day !== day) return meal;
        const slotIndex = slots.indexOf(meal.slot);
        if (slotIndex < 0) return meal;
        return { ...meal, recipeId: pick[slotIndex] || meal.recipeId };
      });
      const next = rebuild(plan, meals, allRecipes, target, ctx);
      const actual = next.dailyActual[day] ?? emptyMacros();
      const score = dayScore(actual, remaining);
      if (score + 1e-9 < bestScore) {
        best = next;
        bestScore = score;
      }
      return;
    }
    const list = options[index];
    if (list.length === 0) {
      pick[index] = "";
      dfs(index + 1);
      return;
    }
    for (const recipe of list) {
      pick[index] = recipe.id;
      dfs(index + 1);
    }
  };
  dfs(0);
  return best;
}

/** 失败天先钉 wanted 槽再换其余；不塞鸡爪。 */
export function repairPlanToGate(
  plan: MealPlan,
  allRecipes: Recipe[],
  target: NutritionTarget,
  ctx: PlanContext,
): PlanRepairResult {
  const remaining = remainingOf(target, ctx.profile);
  const candidates = cookableRecipes(
    allRecipes,
    ctx.profile,
    ctx.ingredients,
    ctx.universe,
  );
  const wanted = new Set(ctx.wantedRecipeIds ?? []);
  const slots = enabledSlotsOf(ctx.profile);
  const original = plan;

  let current = recomputeMicroAdjust(plan, allRecipes, target, ctx);
  let gate = nutritionGate(current, remaining);
  if (gate.ok) {
    return {
      plan: current,
      ok: true,
      changedDays: changedDaySet(original, current),
    };
  }

  for (const pinWanted of [true, false]) {
    gate = nutritionGate(current, remaining);
    if (gate.ok) break;
    for (const day of gate.failingDays) {
      current = searchDay(
        current,
        day,
        slots,
        candidates,
        allRecipes,
        target,
        ctx,
        remaining,
        wanted,
        pinWanted,
      );
    }
  }
  gate = nutritionGate(current, remaining);

  return {
    plan: current,
    ok: gate.ok,
    changedDays: changedDaySet(original, current),
  };
}
