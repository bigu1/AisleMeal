import originalPer100g from "./ingredientPer100g.lock.json";
import type { Ingredient, Recipe } from "./types";

export type BasketUiGroup =
  | "protein"
  | "carb"
  | "veg"
  | "fat"
  | "snack"
  | "seasoning";

export const BASKET_UI_GROUPS: BasketUiGroup[] = [
  "protein",
  "carb",
  "veg",
  "fat",
  "snack",
  "seasoning",
];

export const BASKET_UI_GROUP_LABEL: Record<BasketUiGroup, string> = {
  protein: "主蛋白",
  carb: "主食",
  veg: "蔬菜",
  fat: "油脂/其他",
  snack: "加餐",
  seasoning: "调味",
};

export function basketUiGroup(item: Ingredient): BasketUiGroup {
  if (item.category === "seasoning") return "seasoning";
  if (item.microAdjust) return "snack";
  if (item.category === "protein") return "protein";
  if (item.category === "carb") return "carb";
  if (item.category === "veg") return "veg";
  return "fat";
}

export const ORIGINAL_INGREDIENT_IDS = new Set(Object.keys(originalPer100g));

export const SHELF_CORRECTION_IDS = ["honey"] as const;

export function isMainGridIngredient(
  item: Ingredient,
  recipes: Recipe[],
): boolean {
  if (ORIGINAL_INGREDIENT_IDS.has(item.id)) return true;
  if ((SHELF_CORRECTION_IDS as readonly string[]).includes(item.id)) return true;
  return recipes.some((recipe) =>
    recipe.ingredients.some((row) => row.id === item.id),
  );
}

export function mainGridIngredients(
  ingredients: Ingredient[],
  recipes: Recipe[],
): Ingredient[] {
  return ingredients.filter((item) => isMainGridIngredient(item, recipes));
}

export function recipeReferencedIds(recipes: Recipe[]): Set<string> {
  const ids = new Set<string>();
  for (const recipe of recipes) {
    for (const row of recipe.ingredients) ids.add(row.id);
  }
  return ids;
}

export function pantryUniverse(
  ingredients: Ingredient[],
  recipes: Recipe[],
  existingPantryIds: Iterable<string>,
): Set<string> {
  const ids = recipeReferencedIds(recipes);
  for (const item of ingredients) {
    if (item.category === "seasoning") ids.add(item.id);
  }
  for (const id of existingPantryIds) ids.add(id);
  return ids;
}

export function isPantryOrphan(
  id: string,
  ingredients: Ingredient[],
  recipes: Recipe[],
): boolean {
  const item = ingredients.find((row) => row.id === id);
  if (!item) return true;
  if (item.category === "seasoning") return false;
  return !recipeReferencedIds(recipes).has(id);
}

export function canAddToPantry(
  id: string,
  ingredients: Ingredient[],
  recipes: Recipe[],
  existingPantryIds: Iterable<string>,
): boolean {
  return pantryUniverse(ingredients, recipes, existingPantryIds).has(id);
}
