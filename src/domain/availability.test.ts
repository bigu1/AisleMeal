import { describe, expect, it } from "vitest";
import { catalogIds, resolveUniverse } from "./availability";
import { ingredients, recipes } from "./data";
import { cookableRecipes } from "./planner";
import { COMMON_KITCHEN_IDS } from "./shelf";
import type { UserProfile } from "./types";

const fullEq: UserProfile = {
  sex: "male",
  age: 30,
  heightCm: 175,
  weightKg: 70,
  activity: "moderate",
  goal: "cut",
  equipment: ["ricecooker", "airfryer", "microwave", "stove"],
  allergens: [],
  excludedIngredientIds: [],
};

describe("user shelf universe", () => {
  it("resolveUniverse 只含勾选的内置 id", () => {
    const universe = resolveUniverse(["egg", "chicken-breast"]);
    expect(universe.has("egg")).toBe(true);
    expect(universe.has("chicken-breast")).toBe(true);
    expect(universe.has("salmon")).toBe(false);
    expect(universe.size).toBe(2);
  });

  it("自定义 similarToId=egg 能让含蛋菜可做；无 similarTo 不解锁", () => {
    const eggRecipe = recipes.find((row) =>
      row.ingredients.some((item) => item.id === "egg"),
    );
    expect(eggRecipe).toBeTruthy();
    if (!eggRecipe) throw new Error("missing egg recipe");
    const rest = eggRecipe.ingredients
      .map((item) => item.id)
      .filter((id) => id !== "egg");

    const withSimilar = resolveUniverse(rest, [
      {
        id: "user-1",
        name: "自家蛋",
        category: "protein",
        pack: { size: 50, unit: "g", label: "个" },
        per100g: { kcal: 144, protein: 13.3, fat: 8.8, carb: 2.8 },
        similarToId: "egg",
      },
    ]);
    expect(withSimilar.has("egg")).toBe(true);
    expect(
      cookableRecipes([eggRecipe], fullEq, ingredients, withSimilar).map(
        (row) => row.id,
      ),
    ).toContain(eggRecipe.id);

    const noSimilar = resolveUniverse(["white-rice"], [
      {
        id: "user-2",
        name: "神秘酱",
        category: "seasoning",
        pack: { size: 20, unit: "g", label: "瓶" },
        per100g: { kcal: 0, protein: 0, fat: 0, carb: 0 },
      },
    ]);
    expect(noSimilar.has("egg")).toBe(false);
    expect(noSimilar.has("white-rice")).toBe(true);

    const salmon = recipes.find((row) => row.id === "ricecooker-salmon-veg-rice");
    expect(salmon).toBeTruthy();
    if (!salmon) throw new Error("missing salmon recipe");
    const salmonIds = ["salmon", "white-rice", "carrot", "mushroom"];
    expect(
      cookableRecipes(
        [salmon],
        fullEq,
        ingredients,
        resolveUniverse(salmonIds),
      ).map((row) => row.id),
    ).toContain("ricecooker-salmon-veg-rice");
    expect(
      cookableRecipes(
        [salmon],
        fullEq,
        ingredients,
        resolveUniverse(["white-rice", "carrot", "mushroom"]),
      ).map((row) => row.id),
    ).not.toContain("ricecooker-salmon-veg-rice");
  });

  it("catalogIds 等于全部内置 id；常见厨房都在库里", () => {
    const catalog = catalogIds();
    expect(catalog.size).toBe(ingredients.length);
    for (const id of COMMON_KITCHEN_IDS) {
      expect(catalog.has(id), id).toBe(true);
    }
  });
});
