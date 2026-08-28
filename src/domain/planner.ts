import { effectiveExcludedIds } from "./exclusionFamily";
import {
  addMacros,
  emptyMacros,
  planSlotBudget,
  recipeMacros,
  remainingTarget,
  scaleMacros,
  slotTargetsFromBudget,
  TARGET_BAND,
} from "./nutrition";
import { shortNameOf } from "./displayName";
import type {
  Ingredient,
  InfeasiblePlan,
  Macros,
  MealPlan,
  MealSlot,
  MicroAdjustSuggestion,
  NutritionTarget,
  PlanDiversity,
  PlanStyle,
  PlannedMeal,
  Recipe,
  UserProfile,
} from "./types";

export const FAIL_CLOSE_IDS = [
  "salmon",
  "cod",
  "greek-yogurt",
  "skim-milk",
  "whey-protein",
  "oats",
  "sweet-potato",
  "buckwheat-noodle",
  "quinoa",
  "wholewheat-pasta",
  "peanut-butter",
] as const;

export const MICRO_ADJUST_PORTIONS: { ingredientId: string; grams: number }[] = [
  { ingredientId: "greek-yogurt", grams: 100 },
  { ingredientId: "skim-milk", grams: 250 },
  { ingredientId: "whey-protein", grams: 30 },
  { ingredientId: "banana", grams: 80 },
  { ingredientId: "mixed-nuts", grams: 15 },
  { ingredientId: "wholewheat-bread", grams: 40 },
  { ingredientId: "canned-tuna", grams: 60 },
];

export const REPEAT_BAND = 0.35;

export interface PlanContext {
  profile: UserProfile;
  ingredients: Ingredient[];
  universe: Set<string>;
  wantedRecipeIds?: string[];
  planStyle?: PlanStyle;
}

function byIdMap(ingredients: Ingredient[]): Map<string, Ingredient> {
  return new Map(ingredients.map((item) => [item.id, item]));
}

function isSeasoning(ingredient: Ingredient | undefined): boolean {
  return ingredient?.category === "seasoning";
}

export function recipeAllowedByProfile(
  recipe: Recipe,
  profile: UserProfile,
  ingredients: Ingredient[],
): boolean {
  const byId = byIdMap(ingredients);
  const excluded = new Set(effectiveExcludedIds(profile.excludedIngredientIds));
  const allergens = new Set(profile.allergens);
  for (const item of recipe.ingredients) {
    if (excluded.has(item.id)) return false;
    const ingredient = byId.get(item.id);
    if (ingredient?.allergens?.some((a) => allergens.has(a))) return false;
  }
  return true;
}

export function eligibleRecipes(
  recipes: Recipe[],
  profile: UserProfile,
  basketIds?: string[],
  ingredients: Ingredient[] = [],
): Recipe[] {
  const byId = byIdMap(ingredients);
  const basket = basketIds ? new Set(basketIds) : null;
  const equipment = new Set(profile.equipment);

  return recipes.filter((recipe) => {
    if (!recipe.equipment.every((eq) => equipment.has(eq))) return false;
    if (!recipeAllowedByProfile(recipe, profile, ingredients)) return false;
    if (!basket) return true;
    return recipe.ingredients.every((item) => {
      const ingredient = byId.get(item.id);
      return isSeasoning(ingredient) || basket.has(item.id);
    });
  });
}

export function cookableRecipes(
  recipes: Recipe[],
  profile: UserProfile,
  ingredients: Ingredient[],
  universe: Set<string>,
): Recipe[] {
  const byId = byIdMap(ingredients);
  return recipes.filter((recipe) => {
    if (!recipe.equipment.every((eq) => profile.equipment.includes(eq))) {
      return false;
    }
    if (!recipeAllowedByProfile(recipe, profile, ingredients)) return false;
    return recipe.ingredients.every((row) => {
      const ing = byId.get(row.id);
      return ing?.category === "seasoning" || universe.has(row.id);
    });
  });
}

export function wantedChipBadge(
  id: string,
  cookableIds: Set<string>,
  plan: MealPlan | InfeasiblePlan | null,
  recipeSlots?: MealSlot[],
  enabledSlots?: MealSlot[],
): "无法做" | "未排上" | "这顿不备" | null {
  if (
    recipeSlots &&
    enabledSlots &&
    recipeSlots.length > 0 &&
    !recipeSlots.some((slot) => enabledSlots.includes(slot))
  ) {
    return "这顿不备";
  }
  if (!cookableIds.has(id)) return "无法做";
  if (plan && plan.feasible === true) {
    const used = plan.meals.some((meal) => meal.recipeId === id);
    return used ? null : "未排上";
  }
  return null;
}

function isPerishable(recipe: Recipe, byId: Map<string, Ingredient>): boolean {
  return recipe.ingredients.some((item) => {
    const ingredient = byId.get(item.id);
    if (!ingredient) return false;
    return ingredient.storage.fridgeDays <= 3 && !ingredient.storage.freezable;
  });
}

function safeDivisor(n: number): number {
  return n < 1 ? 1 : n;
}

export function scoreRecipe(
  recipe: Recipe,
  slotTarget: Macros,
  day: number,
  days: number,
  byId: Map<string, Ingredient>,
): number {
  const macros = recipeMacros(recipe, byId);
  const perishPenalty =
    day >= Math.floor(days / 2) && isPerishable(recipe, byId) ? 0.3 : 0;
  return (
    Math.abs(macros.kcal - slotTarget.kcal) / safeDivisor(slotTarget.kcal) +
    Math.abs(macros.protein - slotTarget.protein) /
      safeDivisor(slotTarget.protein) +
    0.5 *
      (Math.abs(macros.fat - slotTarget.fat) / safeDivisor(slotTarget.fat) +
        Math.abs(macros.carb - slotTarget.carb) / safeDivisor(slotTarget.carb)) +
    perishPenalty
  );
}

export function buildPlan(
  candidates: Recipe[],
  target: NutritionTarget,
  days: number,
  ctx: PlanContext,
): MealPlan | InfeasiblePlan {
  const byId = byIdMap(ctx.ingredients);
  const recipeMap = new Map(candidates.map((r) => [r.id, r]));
  const meals: PlannedMeal[] = [];
  const blockedSlots: MealSlot[] = [];
  const style: PlanStyle = ctx.planStyle ?? "easy";
  const used: Record<MealSlot, Map<string, number>> = {
    breakfast: new Map(),
    lunch: new Map(),
    dinner: new Map(),
  };
  const wantedUsed: Record<MealSlot, Map<string, number>> = {
    breakfast: new Map(),
    lunch: new Map(),
    dinner: new Map(),
  };
  const wantedIds = new Set(ctx.wantedRecipeIds ?? []);
  const budget = planSlotBudget(target, ctx.profile);

  for (let day = 0; day < days; day += 1) {
    for (const slot of budget.enabledSlots) {
      const pool = candidates.filter((r) => r.mealSlots.includes(slot));

      if (pool.length === 0) {
        blockedSlots.push(slot);
        return {
          feasible: false,
          reason: "no_recipes_for_slot",
          blockedSlots,
          suggestions: [],
        };
      }

      const slotTarget = slotTargetsFromBudget(budget, target, slot);
      const wantedPool = wantedIds.size
        ? pool.filter((recipe) => wantedIds.has(recipe.id))
        : [];
      const recipeId =
        wantedPool.length > 0
          ? pickWantedRecipeId(
              wantedPool,
              slotTarget,
              day,
              days,
              byId,
              wantedUsed[slot],
            )
          : pickRecipeId(pool, slotTarget, day, days, byId, style, used[slot]);
      meals.push({ day, slot, recipeId });
      used[slot].set(recipeId, (used[slot].get(recipeId) ?? 0) + 1);
      if (wantedPool.length > 0) {
        wantedUsed[slot].set(
          recipeId,
          (wantedUsed[slot].get(recipeId) ?? 0) + 1,
        );
      }
    }
  }

  const dailyActual = sumDailyActual(meals, days, recipeMap, byId);
  const draft: MealPlan = {
    days,
    meals,
    dailyActual,
    microAdjust: [],
    feasible: true,
  };
  return applyMicroAdjust(draft, target, ctx);
}

function pickWantedRecipeId(
  wantedPool: Recipe[],
  slotTarget: Macros,
  day: number,
  days: number,
  byId: Map<string, Ingredient>,
  slotWantedUsed: Map<string, number>,
): string {
  const ranked = [...wantedPool];
  ranked.sort((a, b) => {
    const ua = slotWantedUsed.get(a.id) ?? 0;
    const ub = slotWantedUsed.get(b.id) ?? 0;
    if (ua !== ub) return ua - ub;
    const sa = scoreRecipe(a, slotTarget, day, days, byId);
    const sb = scoreRecipe(b, slotTarget, day, days, byId);
    if (sa !== sb) return sa - sb;
    return a.id.localeCompare(b.id);
  });
  return ranked[0].id;
}

function pickRecipeId(
  pool: Recipe[],
  slotTarget: Macros,
  day: number,
  days: number,
  byId: Map<string, Ingredient>,
  style: PlanStyle,
  slotUsed: Map<string, number>,
): string {
  if (style !== "variety") {
    const easy = [...pool];
    easy.sort((a, b) => {
      const sa = scoreRecipe(a, slotTarget, day, days, byId);
      const sb = scoreRecipe(b, slotTarget, day, days, byId);
      if (sa !== sb) return sa - sb;
      return a.id.localeCompare(b.id);
    });
    return easy[0].id;
  }

  const scored = pool.map((recipe) => ({
    recipe,
    score: scoreRecipe(recipe, slotTarget, day, days, byId),
  }));
  let best = scored[0];
  for (const row of scored) {
    if (row.score < best.score) best = row;
    else if (row.score === best.score && row.recipe.id < best.recipe.id) best = row;
  }
  const band = scored.filter((row) => row.score <= best.score + REPEAT_BAND);
  band.sort((a, b) => {
    const ua = slotUsed.get(a.recipe.id) ?? 0;
    const ub = slotUsed.get(b.recipe.id) ?? 0;
    if (ua !== ub) return ua - ub;
    if (a.score !== b.score) return a.score - b.score;
    return a.recipe.id.localeCompare(b.recipe.id);
  });
  return band[0].recipe.id;
}

export function summarizePlanDiversity(plan: MealPlan): PlanDiversity {
  const uniqueIds = [...new Set(plan.meals.map((meal) => meal.recipeId))];
  return {
    unique: uniqueIds.length,
    repeatMeals: plan.meals.length - uniqueIds.length,
    uniqueIds,
  };
}

export function explainMealChoice(
  recipe: Recipe,
  day: number,
  slot: MealSlot,
  plan: MealPlan,
  style: PlanStyle,
  basketIds: string[] | undefined,
  byId: Map<string, Ingredient>,
): string {
  if (style === "easy" && day > 0) {
    const yesterday = plan.meals.find((meal) => meal.day === day - 1 && meal.slot === slot);
    if (yesterday?.recipeId === recipe.id) return "省事：重复昨天这餐";
  }
  if (day < Math.floor(plan.days / 2)) {
    const perish = recipe.ingredients.find((item) => {
      const ingredient = byId.get(item.id);
      if (!ingredient) return false;
      return ingredient.storage.fridgeDays <= 3 && !ingredient.storage.freezable;
    });
    if (perish) {
      const ingredient = byId.get(perish.id);
      const name = ingredient ? shortNameOf(ingredient) : perish.id;
      return `优先消耗易坏${name}`;
    }
  }
  const basket = new Set(basketIds ?? []);
  const nonSeasoning = recipe.ingredients.filter(
    (item) => byId.get(item.id)?.category !== "seasoning",
  );
  const inBasket = nonSeasoning.filter((item) => basket.has(item.id));
  const pool = inBasket.length > 0 ? inBasket : nonSeasoning;
  const picked = [...pool].sort((a, b) => b.grams - a.grams)[0];
  if (!picked) return `用上${recipe.name}`;
  const ingredient = byId.get(picked.id);
  const name = ingredient ? shortNameOf(ingredient) : picked.id;
  return inBasket.length > 0 ? `用上已选的${name}` : `用上${name}`;
}

function sumDailyActual(
  meals: PlannedMeal[],
  days: number,
  recipeMap: Map<string, Recipe>,
  byId: Map<string, Ingredient>,
  extras: MicroAdjustSuggestion[] = [],
): Macros[] {
  const daily = Array.from({ length: days }, () => emptyMacros());
  for (const meal of meals) {
    const recipe = recipeMap.get(meal.recipeId);
    if (!recipe) continue;
    daily[meal.day] = addMacros(daily[meal.day], recipeMacros(recipe, byId));
  }
  for (const extra of extras) {
    const ingredient = byId.get(extra.ingredientId);
    if (!ingredient) continue;
    daily[extra.day] = addMacros(
      daily[extra.day],
      scaleMacros(ingredient.per100g, extra.grams),
    );
  }
  return daily;
}

function allowedMicroIngredient(
  ingredient: Ingredient,
  profile: UserProfile,
): boolean {
  if (!ingredient.microAdjust) return false;
  if (effectiveExcludedIds(profile.excludedIngredientIds).includes(ingredient.id)) {
    return false;
  }
  if (ingredient.allergens?.some((a) => profile.allergens.includes(a))) {
    return false;
  }
  return true;
}

export function applyMicroAdjust(
  plan: MealPlan,
  target: NutritionTarget,
  ctx: PlanContext,
): MealPlan {
  const byId = byIdMap(ctx.ingredients);
  const remaining = remainingTarget(target, planSlotBudget(target, ctx.profile));
  const microAdjust: MicroAdjustSuggestion[] = [];
  const dailyActual = plan.dailyActual.map((m) => ({ ...m }));

  for (let day = 0; day < plan.days; day += 1) {
    let added = 0;
    while (added < 3) {
      const actual = dailyActual[day];
      const proteinLow = actual.protein < remaining.protein * TARGET_BAND.lo;
      const kcalLow = actual.kcal < remaining.kcal * TARGET_BAND.lo;
      if (!proteinLow && !kcalLow) break;

      const needP = Math.max(0, remaining.protein * TARGET_BAND.lo - actual.protein);
      const needK = Math.max(0, remaining.kcal * TARGET_BAND.lo - actual.kcal);
      type Cand = {
        portion: (typeof MICRO_ADJUST_PORTIONS)[number];
        gain: number;
        delta: Macros;
      };
      const cands: Cand[] = [];
      for (const portion of MICRO_ADJUST_PORTIONS) {
        if (!ctx.universe.has(portion.ingredientId)) continue;
        const ingredient = byId.get(portion.ingredientId);
        if (!ingredient || !allowedMicroIngredient(ingredient, ctx.profile)) {
          continue;
        }
        const delta = scaleMacros(ingredient.per100g, portion.grams);
        const next = addMacros(actual, delta);
        if (
          next.protein > remaining.protein * TARGET_BAND.hi ||
          next.kcal > remaining.kcal * TARGET_BAND.hi
        ) {
          continue;
        }
        let gain = 0;
        if (proteinLow) {
          gain += Math.min(delta.protein, needP) / Math.max(needP, 1);
        }
        if (kcalLow) {
          gain += Math.min(delta.kcal, needK) / Math.max(needK, 1);
        }
        cands.push({ portion, gain, delta });
      }
      cands.sort((a, b) => b.gain - a.gain);
      const picked = cands[0];
      if (!picked || picked.gain <= 0) break;

      const delta = picked.delta;
      dailyActual[day] = addMacros(actual, delta);
      const reason = proteinLow
        ? `补 ${Math.round(delta.protein)}g 蛋白`
        : `补 ${Math.round(delta.kcal)} kcal`;
      microAdjust.push({
        day,
        ingredientId: picked.portion.ingredientId,
        grams: picked.portion.grams,
        reason,
      });
      added += 1;
    }
  }

  return {
    ...plan,
    dailyActual,
    microAdjust: collapseMicroAdjust(microAdjust),
    feasible: true,
  };
}

function mergeMicroAdjustReasons(a: string, b: string): string {
  const protein = /^补 (\d+)g 蛋白$/;
  const kcal = /^补 (\d+) kcal$/;
  const ap = a.match(protein);
  const bp = b.match(protein);
  if (ap && bp) {
    return `补 ${Number(ap[1]) + Number(bp[1])}g 蛋白`;
  }
  const ak = a.match(kcal);
  const bk = b.match(kcal);
  if (ak && bk) {
    return `补 ${Number(ak[1]) + Number(bk[1])} kcal`;
  }
  if (a === b) return a;
  return `${a}；${b}`;
}

export function collapseMicroAdjust(
  items: MicroAdjustSuggestion[],
): MicroAdjustSuggestion[] {
  const order: string[] = [];
  const merged = new Map<string, MicroAdjustSuggestion>();
  for (const item of items) {
    const key = `${item.day}:${item.ingredientId}`;
    const prev = merged.get(key);
    if (!prev) {
      order.push(key);
      merged.set(key, { ...item });
      continue;
    }
    merged.set(key, {
      ...prev,
      grams: prev.grams + item.grams,
      reason: mergeMicroAdjustReasons(prev.reason, item.reason),
    });
  }
  return order.map((key) => merged.get(key)!);
}

export function suggestAdditions(
  allRecipes: Recipe[],
  profile: UserProfile,
  universe: Set<string>,
  ingredients: Ingredient[],
): { ingredientId: string; unlocksRecipes: number }[] {
  const current = universe;
  const baseline = new Set(
    cookableRecipes(allRecipes, profile, ingredients, universe).map((r) => r.id),
  );
  const scored: { ingredientId: string; unlocksRecipes: number }[] = [];

  for (const ingredient of ingredients) {
    if (ingredient.category === "seasoning") continue;
    if (current.has(ingredient.id)) continue;
    const unlocked = cookableRecipes(
      allRecipes,
      profile,
      ingredients,
      new Set([...universe, ingredient.id]),
    ).filter((r) => !baseline.has(r.id)).length;
    scored.push({ ingredientId: ingredient.id, unlocksRecipes: unlocked });
  }

  scored.sort((a, b) => {
    if (b.unlocksRecipes !== a.unlocksRecipes) {
      return b.unlocksRecipes - a.unlocksRecipes;
    }
    return a.ingredientId.localeCompare(b.ingredientId);
  });
  return scored.slice(0, 3);
}

export function alternativesFor(
  plan: MealPlan,
  day: number,
  slot: MealSlot,
  candidates: Recipe[],
  target: NutritionTarget,
  ctx: PlanContext,
): Recipe[] {
  const byId = byIdMap(ctx.ingredients);
  const current = plan.meals.find((m) => m.day === day && m.slot === slot);
  const slotTarget = slotTargetsFromBudget(
    planSlotBudget(target, ctx.profile),
    target,
    slot,
  );

  return candidates
    .filter((recipe) => {
      if (!recipe.mealSlots.includes(slot)) return false;
      if (recipe.id === current?.recipeId) return false;
      return true;
    })
    .sort((a, b) => {
      const sa = scoreRecipe(a, slotTarget, day, plan.days, byId);
      const sb = scoreRecipe(b, slotTarget, day, plan.days, byId);
      if (sa !== sb) return sa - sb;
      return a.id.localeCompare(b.id);
    });
}

export function replaceMeal(
  plan: MealPlan,
  day: number,
  slot: MealSlot,
  recipeId: string,
  candidates: Recipe[],
  target: NutritionTarget,
  ctx: PlanContext,
  catalog: Recipe[] = candidates,
): MealPlan {
  const byId = byIdMap(ctx.ingredients);
  const recipeMap = new Map(catalog.map((r) => [r.id, r]));
  for (const recipe of candidates) recipeMap.set(recipe.id, recipe);
  const meals = plan.meals.map((meal) =>
    meal.day === day && meal.slot === slot ? { ...meal, recipeId } : meal,
  );
  const dailyActual = sumDailyActual(meals, plan.days, recipeMap, byId);
  return applyMicroAdjust(
    { ...plan, meals, dailyActual, microAdjust: [] },
    target,
    ctx,
  );
}

export function recomputeMicroAdjust(
  plan: MealPlan,
  allRecipes: Recipe[],
  target: NutritionTarget,
  ctx: PlanContext,
): MealPlan {
  const byId = byIdMap(ctx.ingredients);
  const recipeMap = new Map(allRecipes.map((recipe) => [recipe.id, recipe]));
  const dailyActual = sumDailyActual(plan.meals, plan.days, recipeMap, byId);
  return applyMicroAdjust(
    { ...plan, dailyActual, microAdjust: [] },
    target,
    ctx,
  );
}

export function createMealPlan(
  allRecipes: Recipe[],
  target: NutritionTarget,
  days: number,
  ctx: PlanContext,
): MealPlan | InfeasiblePlan {
  const candidates = cookableRecipes(
    allRecipes,
    ctx.profile,
    ctx.ingredients,
    ctx.universe,
  );
  const result = buildPlan(candidates, target, days, ctx);
  if (result.feasible) return result;
  return {
    ...result,
    suggestions: suggestAdditions(
      allRecipes,
      ctx.profile,
      ctx.universe,
      ctx.ingredients,
    ),
  };
}
