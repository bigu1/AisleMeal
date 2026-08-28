import { ingredients } from "./data";
import type { CustomIngredient } from "./types";

export const USER_SHELF_SOURCE_ID = "user-shelf" as const;

export function allIngredientIds(
  list: { id: string }[] = ingredients,
): Set<string> {
  return new Set(list.map((item) => item.id));
}

/** 货架勾选 ∪ 自定义「等同于」的内置 id。 */
export function resolveUniverse(
  shelfIds: readonly string[],
  custom: readonly CustomIngredient[] = [],
): Set<string> {
  const out = new Set<string>();
  for (const id of shelfIds) out.add(id);
  for (const item of custom) {
    if (item.similarToId) out.add(item.similarToId);
  }
  return out;
}

/** @deprecated 用 allIngredientIds；保留给旧测试别名 */
export function catalogIds(): Set<string> {
  return allIngredientIds();
}
