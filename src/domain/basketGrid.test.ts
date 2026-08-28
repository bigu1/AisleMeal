import { describe, expect, it } from "vitest";
import {
  basketUiGroup,
  canAddToPantry,
  isPantryOrphan,
  pantryUniverse,
  recipeReferencedIds,
} from "./basketGrid";
import { ingredients, recipes } from "./data";

describe("basketUiGroup", () => {
  it("olive-oil 在油脂组，微调进加餐", () => {
    const oil = ingredients.find((item) => item.id === "olive-oil");
    const banana = ingredients.find((item) => item.id === "banana");
    expect(oil).toBeTruthy();
    expect(banana).toBeTruthy();
    if (!oil || !banana) throw new Error("missing ingredients");
    expect(basketUiGroup(oil)).toBe("fat");
    expect(banana.microAdjust).toBe(true);
    expect(basketUiGroup(banana)).toBe("snack");
  });

  it("pantry 宇宙=菜谱引用∪全部调味∪已有孤儿；零引用非调味不能新加", () => {
    const referenced = recipeReferencedIds(recipes);
    expect(referenced.has("chicken-feet")).toBe(true);
    const orphan = ingredients.find(
      (item) =>
        item.category !== "seasoning" && !referenced.has(item.id),
    );
    expect(orphan, "需要一条真正零引用非调味").toBeTruthy();
    if (!orphan) throw new Error("missing unreferenced ingredient");
    expect(canAddToPantry(orphan.id, ingredients, recipes, [])).toBe(false);
    expect(isPantryOrphan(orphan.id, ingredients, recipes)).toBe(true);
    expect(
      canAddToPantry(orphan.id, ingredients, recipes, [orphan.id]),
    ).toBe(true);
    const universeWithOrphan = pantryUniverse(ingredients, recipes, [
      orphan.id,
    ]);
    expect(universeWithOrphan.has(orphan.id)).toBe(true);
    expect(canAddToPantry("chicken-breast", ingredients, recipes, [])).toBe(
      true,
    );
    const seasoning = ingredients.find((item) => item.category === "seasoning");
    expect(seasoning).toBeTruthy();
    if (!seasoning) throw new Error("missing seasoning");
    expect(canAddToPantry(seasoning.id, ingredients, recipes, [])).toBe(true);
    expect(referenced.has("chicken-breast")).toBe(true);
    const emptyUniverse = pantryUniverse(ingredients, recipes, []);
    expect(emptyUniverse.has(orphan.id)).toBe(false);
    expect(emptyUniverse.has("chicken-breast")).toBe(true);
  });
});
