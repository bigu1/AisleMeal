import {
  computeTarget,
  enabledSlotsOf,
  planSlotBudget,
  remainingTarget,
  recipeMacros,
} from "./nutrition";
import {
  createMealPlan,
  eligibleRecipes,
  FAIL_CLOSE_IDS,
  recipeAllowedByProfile,
  summarizePlanDiversity,
} from "./planner";
import { buildShoppingList, flattenShoppingList } from "./shoppingList";
import type {
  Ingredient,
  MealSlot,
  PantryItem,
  PlanStyle,
  Recipe,
  UserProfile,
} from "./types";

export { FAIL_CLOSE_IDS };

const PROCESSED_MEAT_NAME = /午餐肉|火腿肠|烤肠|鸡爪|腊肠|肉松/;

export interface HealthyRecommendation {
  recipe: Recipe;
  status: "ready" | "need_more";
  missingIds: string[];
}

function byIdMap(ingredients: Ingredient[]): Map<string, Ingredient> {
  return new Map(ingredients.map((item) => [item.id, item]));
}

export function isProcessedMeat(ingredient: Ingredient | undefined): boolean {
  if (!ingredient) return false;
  return PROCESSED_MEAT_NAME.test(ingredient.name);
}

export function missingNonSeasoningIds(
  recipe: Recipe,
  universe: Set<string> | readonly string[],
  ingredients: Ingredient[],
): string[] {
  const universeSet = universe instanceof Set ? universe : new Set(universe);
  const byId = byIdMap(ingredients);
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const item of recipe.ingredients) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    if (universeSet.has(item.id)) continue;
    if (byId.get(item.id)?.category === "seasoning") continue;
    missing.push(item.id);
  }
  return missing;
}

export type MissingCookKind = "ok" | "unavailable" | "out_of_scope";

export function missingCookKind(
  missing: readonly string[],
  shelf: Set<string>,
): MissingCookKind {
  if (missing.length === 0) return "ok";
  const allUnavailable = missing.every((id) => !shelf.has(id));
  return allUnavailable ? "unavailable" : "out_of_scope";
}

export function missingCookLabel(kind: MissingCookKind): string {
  if (kind === "ok") return "可做";
  if (kind === "unavailable") return "手头没有";
  return "还缺这些食材";
}

export function healthRankScore(
  recipe: Recipe,
  ingredients: Ingredient[],
): number {
  const byId = byIdMap(ingredients);
  const macros = recipeMacros(recipe, byId);
  const proteinDensity = macros.kcal > 0 ? macros.protein / macros.kcal : 0;
  const hasVeg = recipe.ingredients.some(
    (item) => byId.get(item.id)?.category === "veg",
  );
  const isMain =
    recipe.mealSlots.includes("lunch") || recipe.mealSlots.includes("dinner");
  const vegBonus = isMain && hasVeg ? 0.2 : 0;
  const processed = recipe.ingredients.some((item) =>
    isProcessedMeat(byId.get(item.id)),
  );
  return proteinDensity + vegBonus - (processed ? 0.6 : 0);
}

export function recommendHealthyMeals(
  recipes: Recipe[],
  ingredients: Ingredient[],
  profile: UserProfile,
  basketIds: string[],
  limits?: { ready?: number; almost?: number },
): { ready: HealthyRecommendation[]; almost: HealthyRecommendation[] } {
  const equipment = new Set(profile.equipment);
  const allowed = recipes.filter((recipe) => {
    if (!recipe.equipment.every((eq) => equipment.has(eq))) return false;
    return recipeAllowedByProfile(recipe, profile, ingredients);
  });

  const ready: HealthyRecommendation[] = [];
  const almost: HealthyRecommendation[] = [];
  for (const recipe of allowed) {
    const missingIds = missingNonSeasoningIds(recipe, basketIds, ingredients);
    if (missingIds.length === 0) {
      ready.push({ recipe, status: "ready", missingIds: [] });
    } else if (missingIds.length <= 3) {
      almost.push({ recipe, status: "need_more", missingIds });
    }
  }

  const byHealth = (a: HealthyRecommendation, b: HealthyRecommendation) => {
    const sa = healthRankScore(a.recipe, ingredients);
    const sb = healthRankScore(b.recipe, ingredients);
    if (sb !== sa) return sb - sa;
    return a.recipe.id.localeCompare(b.recipe.id);
  };

  ready.sort(byHealth);
  almost.sort((a, b) => {
    if (a.missingIds.length !== b.missingIds.length) {
      return a.missingIds.length - b.missingIds.length;
    }
    return byHealth(a, b);
  });

  return {
    ready: ready.slice(0, limits?.ready ?? 8),
    almost: almost.slice(0, limits?.almost ?? 8),
  };
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

export interface HealthyBasketSuggestion {
  ids: string[];
  ok: boolean;
  hint?: string;
}

function recipeIntroducesBlocked(
  recipe: Recipe,
  byId: Map<string, Ingredient>,
): boolean {
  return recipe.ingredients.some((item) => {
    const ingredient = byId.get(item.id);
    if (!ingredient) return true;
    if (ingredient.category === "seasoning") return false;
    return isProcessedMeat(ingredient);
  });
}

function nonSeasoningIds(
  recipe: Recipe,
  byId: Map<string, Ingredient>,
): string[] {
  return recipe.ingredients
    .filter((item) => byId.get(item.id)?.category !== "seasoning")
    .map((item) => item.id);
}

function rankHealthySlotPool(
  recipes: Recipe[],
  ingredients: Ingredient[],
  profile: UserProfile,
  byId: Map<string, Ingredient>,
  slot: MealSlot,
): Recipe[] {
  return recipes
    .filter((recipe) => {
      if (!recipe.mealSlots.includes(slot)) return false;
      if (!recipe.equipment.every((eq) => profile.equipment.includes(eq))) {
        return false;
      }
      if (!recipeAllowedByProfile(recipe, profile, ingredients)) return false;
      return !recipeIntroducesBlocked(recipe, byId);
    })
    .sort((a, b) => {
      const sa = healthRankScore(a, ingredients);
      const sb = healthRankScore(b, ingredients);
      if (sb !== sa) return sb - sa;
      return a.id.localeCompare(b.id);
    });
}

export function suggestHealthyBasket(
  recipes: Recipe[],
  ingredients: Ingredient[],
  profile: UserProfile,
  currentIds: string[],
  days = 7,
): HealthyBasketSuggestion {
  const byId = byIdMap(ingredients);
  const failHint = "当前厨具或天数凑不出可买的健康篮，请改厨具、天数或手动勾选";
  const kept = uniqueIds(currentIds.filter((id) => byId.has(id)));
  const target = computeTarget(profile);

  const feasible = (ids: string[]): boolean => {
    const one = createMealPlan(recipes, target, 1, {
      profile,
      ingredients,
      universe: new Set(ids),
    });
    if (!one.feasible) return false;
    if (days <= 1) return true;
    return createMealPlan(recipes, target, days, {
      profile,
      ingredients,
      universe: new Set(ids),
    }).feasible;
  };

  const picked: Recipe[] = [];
  const used = new Set<string>();
  for (const slot of enabledSlotsOf(profile)) {
    const pool = rankHealthySlotPool(recipes, ingredients, profile, byId, slot);
    const choice = pool.find((recipe) => !used.has(recipe.id)) ?? pool[0];
    if (!choice) {
      return { ids: [], ok: false, hint: failHint };
    }
    picked.push(choice);
    used.add(choice.id);
  }

  let next = uniqueIds([
    ...kept,
    ...picked.flatMap((recipe) => nonSeasoningIds(recipe, byId)),
  ]);

  for (const slot of enabledSlotsOf(profile)) {
    const pool = rankHealthySlotPool(recipes, ingredients, profile, byId, slot);
    for (const recipe of pool) {
      const slotCount = eligibleRecipesForSlot(
        recipes,
        profile,
        next,
        ingredients,
        slot,
      );
      if (slotCount >= 2) break;
      next = uniqueIds([...next, ...nonSeasoningIds(recipe, byId)]);
    }
  }

  next = addCarbsFromHealthyRecipes(
    next,
    recipes,
    ingredients,
    profile,
    byId,
    target,
  );

  if (!feasible(next)) {
    return { ids: [], ok: false, hint: failHint };
  }
  return { ids: next, ok: true };
}

function basketHasCarb(
  ids: string[],
  byId: Map<string, Ingredient>,
): boolean {
  return ids.some((id) => byId.get(id)?.category === "carb");
}

function rankHealthyRecipes(
  recipes: Recipe[],
  ingredients: Ingredient[],
  profile: UserProfile,
  byId: Map<string, Ingredient>,
): Recipe[] {
  return recipes
    .filter((recipe) => {
      if (!recipe.equipment.every((eq) => profile.equipment.includes(eq))) {
        return false;
      }
      if (!recipeAllowedByProfile(recipe, profile, ingredients)) return false;
      return !recipeIntroducesBlocked(recipe, byId);
    })
    .sort((a, b) => {
      const sa = healthRankScore(a, ingredients);
      const sb = healthRankScore(b, ingredients);
      if (sb !== sa) return sb - sa;
      return a.id.localeCompare(b.id);
    });
}

function addCarbsFromHealthyRecipes(
  ids: string[],
  recipes: Recipe[],
  ingredients: Ingredient[],
  profile: UserProfile,
  byId: Map<string, Ingredient>,
  target: ReturnType<typeof computeTarget>,
): string[] {
  let next = ids;
  const ranked = rankHealthyRecipes(recipes, ingredients, profile, byId);
  const remainingKcal = remainingTarget(
    target,
    planSlotBudget(target, profile),
  ).kcal;
  const floor = remainingKcal * 0.7;
  const planKcal = (basket: string[]): number | null => {
    const plan = createMealPlan(recipes, target, 1, {
      profile,
      ingredients,
      universe: new Set(basket),
    });
    if (!plan.feasible) return null;
    return plan.dailyActual[0].kcal;
  };
  const kcalTooLow = (basket: string[]): boolean => {
    if (!basketHasCarb(basket, byId)) return true;
    const kcal = planKcal(basket);
    if (kcal == null) return true;
    return kcal < floor;
  };
  for (const recipe of ranked) {
    if (!kcalTooLow(next)) break;
    const carbs = nonSeasoningIds(recipe, byId).filter(
      (id) => byId.get(id)?.category === "carb",
    );
    if (carbs.length === 0) continue;
    const candidate = uniqueIds([...next, ...carbs]);
    if (candidate.length === next.length) continue;
    const before = planKcal(next);
    const after = planKcal(candidate);
    if (after == null) continue;
    if (before != null && after <= before) continue;
    next = candidate;
  }
  return next;
}

function eligibleRecipesForSlot(
  recipes: Recipe[],
  profile: UserProfile,
  basketIds: string[],
  ingredients: Ingredient[],
  slot: MealSlot,
): number {
  return recipes.filter((recipe) => {
    if (!recipe.mealSlots.includes(slot)) return false;
    if (!recipe.equipment.every((eq) => profile.equipment.includes(eq))) {
      return false;
    }
    if (!recipeAllowedByProfile(recipe, profile, ingredients)) return false;
    return missingNonSeasoningIds(recipe, basketIds, ingredients).length === 0;
  }).length;
}

export interface BasketPlanPreview {
  style: PlanStyle;
  ids: string[];
  keepIds: string[];
  addIds: string[];
  removeIds: string[];
  breakfastCount: number;
  mainsCount: number;
  uniquePlanned: number;
  repeatMeals: number;
  packCount?: number;
  ok: boolean;
  hint?: string;
}

function keptKnownIds(
  currentIds: string[],
  byId: Map<string, Ingredient>,
): string[] {
  return uniqueIds(currentIds.filter((id) => byId.has(id)));
}

function suggestEasyBasket(
  recipes: Recipe[],
  ingredients: Ingredient[],
  profile: UserProfile,
  currentIds: string[],
  days: number,
): HealthyBasketSuggestion {
  const byId = byIdMap(ingredients);
  const failHint = "当前厨具或天数凑不出可买的健康篮，请改厨具、天数或手动勾选";
  const kept = keptKnownIds(currentIds, byId);
  const target = computeTarget(profile);
  const picked: Recipe[] = [];
  for (const slot of enabledSlotsOf(profile)) {
    const pool = rankHealthySlotPool(recipes, ingredients, profile, byId, slot);
    const choice = pool[0];
    if (!choice) {
      return { ids: [], ok: false, hint: failHint };
    }
    picked.push(choice);
  }
  let next = uniqueIds([
    ...kept,
    ...picked.flatMap((recipe) => nonSeasoningIds(recipe, byId)),
  ]);
  next = addCarbsFromHealthyRecipes(
    next,
    recipes,
    ingredients,
    profile,
    byId,
    target,
  );
  const one = createMealPlan(recipes, target, 1, {
    profile,
    ingredients,
    universe: new Set(next),
    planStyle: "easy",
  });
  if (!one.feasible) {
    return { ids: [], ok: false, hint: failHint };
  }
  if (days > 1) {
    const full = createMealPlan(recipes, target, days, {
      profile,
      ingredients,
      universe: new Set(next),
      planStyle: "easy",
    });
    if (!full.feasible) {
      return { ids: [], ok: false, hint: failHint };
    }
  }
  return { ids: next, ok: true };
}

function coverageCounts(
  recipes: Recipe[],
  profile: UserProfile,
  ids: string[],
  ingredients: Ingredient[],
): { breakfastCount: number; mainsCount: number } {
  const eligible = eligibleRecipes(recipes, profile, ids, ingredients);
  const breakfastCount = eligible.filter((recipe) =>
    recipe.mealSlots.includes("breakfast"),
  ).length;
  const mains = new Set(
    eligible
      .filter(
        (recipe) =>
          recipe.mealSlots.includes("lunch") || recipe.mealSlots.includes("dinner"),
      )
      .map((recipe) => recipe.id),
  );
  return { breakfastCount, mainsCount: mains.size };
}

function toBasketPreview(
  style: PlanStyle,
  suggestion: HealthyBasketSuggestion,
  currentIds: string[],
  recipes: Recipe[],
  ingredients: Ingredient[],
  profile: UserProfile,
  days: number,
  pantry: PantryItem[],
): BasketPlanPreview {
  const ids = suggestion.ok ? suggestion.ids : [];
  const currentSet = new Set(currentIds);
  const nextSet = new Set(ids);
  const keepIds = currentIds.filter((id) => nextSet.has(id));
  const addIds = ids.filter((id) => !currentSet.has(id));
  const removeIds = currentIds.filter((id) => !nextSet.has(id));
  if (!suggestion.ok) {
    return {
      style,
      ids,
      keepIds,
      addIds,
      removeIds,
      breakfastCount: 0,
      mainsCount: 0,
      uniquePlanned: 0,
      repeatMeals: 0,
      ok: false,
      hint: suggestion.hint,
    };
  }
  const target = computeTarget(profile);
  const plan = createMealPlan(recipes, target, days, {
    profile,
    ingredients,
    universe: new Set(ids),
    planStyle: style,
  });
  if (!plan.feasible) {
    return {
      style,
      ids,
      keepIds,
      addIds,
      removeIds,
      breakfastCount: 0,
      mainsCount: 0,
      uniquePlanned: 0,
      repeatMeals: 0,
      ok: false,
      hint: suggestion.hint ?? "当前厨具或天数凑不出可买的健康篮，请改厨具、天数或手动勾选",
    };
  }
  const diversity = summarizePlanDiversity(plan);
  const { breakfastCount, mainsCount } = coverageCounts(
    recipes,
    profile,
    ids,
    ingredients,
  );
  const packCount = flattenShoppingList(
    buildShoppingList(plan, pantry, ingredients, recipes, days),
  ).reduce((sum, line) => sum + line.packs, 0);
  return {
    style,
    ids,
    keepIds,
    addIds,
    removeIds,
    breakfastCount,
    mainsCount,
    uniquePlanned: diversity.unique,
    repeatMeals: diversity.repeatMeals,
    packCount,
    ok: true,
  };
}

export function previewHealthyBaskets(args: {
  recipes: Recipe[];
  ingredients: Ingredient[];
  profile: UserProfile;
  currentIds: string[];
  days: number;
  pantry?: PantryItem[];
}): { easy: BasketPlanPreview; variety: BasketPlanPreview } {
  const { recipes, ingredients, profile, currentIds, days, pantry = [] } = args;
  const easy = suggestEasyBasket(
    recipes,
    ingredients,
    profile,
    currentIds,
    days,
  );
  const variety = suggestHealthyBasket(
    recipes,
    ingredients,
    profile,
    currentIds,
    days,
  );
  return {
    easy: toBasketPreview(
      "easy",
      easy,
      currentIds,
      recipes,
      ingredients,
      profile,
      days,
      pantry,
    ),
    variety: toBasketPreview(
      "variety",
      variety,
      currentIds,
      recipes,
      ingredients,
      profile,
      days,
      pantry,
    ),
  };
}
