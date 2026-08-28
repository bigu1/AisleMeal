import { effectiveExcludedIds } from "./exclusionFamily";
import { allIngredientIds } from "./availability";
import type { Ingredient, UserProfile } from "./types";

function ingredientMap(ingredients: Ingredient[]): Map<string, Ingredient> {
  return new Map(ingredients.map((item) => [item.id, item]));
}

export function isBasketIdBlocked(
  id: string,
  profile: UserProfile,
  byId: Map<string, Ingredient>,
  catalog: Set<string> = allIngredientIds(),
): boolean {
  if (!catalog.has(id) && !id.startsWith("user-")) return true;
  if (effectiveExcludedIds(profile.excludedIngredientIds).includes(id)) {
    return true;
  }
  const ingredient = byId.get(id);
  if (!ingredient) return true;
  if (ingredient.allergens?.some((a) => profile.allergens.includes(a))) {
    return true;
  }
  return false;
}

/** 过敏/忌口不能留在已选。自定义 id 不在内置 catalog 里，不在这里洗掉。 */
export function sanitizeBasket(
  ids: readonly string[],
  profile: UserProfile,
  ingredients: Ingredient[],
  catalog: Set<string> = allIngredientIds(),
): string[] {
  const byId = ingredientMap(ingredients);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    if (id.startsWith("user-")) {
      out.push(id);
      continue;
    }
    if (isBasketIdBlocked(id, profile, byId, catalog)) continue;
    out.push(id);
  }
  return out;
}
