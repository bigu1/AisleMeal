import type {
  Category,
  Ingredient,
  MealPlan,
  PantryItem,
  Recipe,
  ShoppingLine,
  ShoppingListGrouped,
} from "./types";

export function storageHintFor(
  ingredient: Ingredient,
  days: number,
): string | undefined {
  if (ingredient.storage.fridgeDays >= days) return undefined;
  if (ingredient.storage.freezable) return "买回当天分装冷冻";
  return `第 ${ingredient.storage.fridgeDays} 天前吃完`;
}

export function formatShoppingLine(
  line: ShoppingLine,
  ingredient: Ingredient,
): string {
  return `${ingredient.name} ×${line.packs}${ingredient.pack.label}（${line.packGrams}g，实际需 ${line.needGrams}g，富余 ${line.surplusGrams}g）`;
}

export function buildShoppingList(
  plan: MealPlan,
  pantry: PantryItem[],
  ingredients: Ingredient[],
  recipes: Recipe[],
  days: number,
): ShoppingListGrouped {
  const byId = new Map(ingredients.map((item) => [item.id, item]));
  const recipeMap = new Map(recipes.map((r) => [r.id, r]));
  const totals = new Map<string, number>();

  for (const meal of plan.meals) {
    const recipe = recipeMap.get(meal.recipeId);
    if (!recipe) continue;
    for (const item of recipe.ingredients) {
      totals.set(item.id, (totals.get(item.id) ?? 0) + item.grams);
    }
  }
  for (const extra of plan.microAdjust) {
    totals.set(
      extra.ingredientId,
      (totals.get(extra.ingredientId) ?? 0) + extra.grams,
    );
  }

  const pantryGrams = new Map<string, number>();
  for (const item of pantry) {
    pantryGrams.set(
      item.ingredientId,
      (pantryGrams.get(item.ingredientId) ?? 0) + item.grams,
    );
  }

  const lines: ShoppingLine[] = [];
  for (const [ingredientId, total] of totals) {
    const ingredient = byId.get(ingredientId);
    if (!ingredient) continue;
    const needGrams = Math.max(0, total - (pantryGrams.get(ingredientId) ?? 0));
    if (needGrams === 0) continue;
    const packs = Math.ceil(needGrams / ingredient.pack.size);
    const packGrams = packs * ingredient.pack.size;
    lines.push({
      ingredientId,
      needGrams,
      packs,
      packGrams,
      surplusGrams: packGrams - needGrams,
      storageHint: storageHintFor(ingredient, days),
    });
  }

  const grouped: ShoppingListGrouped = {
    protein: [],
    carb: [],
    veg: [],
    fat: [],
    seasoning: [],
  };
  const order: Category[] = ["protein", "carb", "veg", "fat", "seasoning"];
  for (const cat of order) {
    grouped[cat] = lines
      .filter((line) => byId.get(line.ingredientId)?.category === cat)
      .sort((a, b) => a.ingredientId.localeCompare(b.ingredientId));
  }
  return grouped;
}

export function flattenShoppingList(
  grouped: ShoppingListGrouped,
): ShoppingLine[] {
  return [
    ...grouped.protein,
    ...grouped.carb,
    ...grouped.veg,
    ...grouped.fat,
    ...grouped.seasoning,
  ];
}

export function isBulkyPack(line: {
  needGrams: number;
  packGrams: number;
  surplusGrams: number;
}): boolean {
  if (line.needGrams <= 0) return false;
  return (
    line.surplusGrams / line.needGrams >= 3 ||
    line.packGrams / line.needGrams >= 5
  );
}
