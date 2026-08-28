import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ingredients, recipes } from "./data";
import { computeTarget, planSlotBudget, remainingTarget } from "./nutrition";
import { createMealPlan, eligibleRecipes } from "./planner";
import { catalogIds } from "./availability";
import {
  isProcessedMeat,
  missingCookKind,
  missingCookLabel,
  missingNonSeasoningIds,
  previewHealthyBaskets,
  recommendHealthyMeals,
  suggestHealthyBasket,
} from "./recommend";
import { buildShoppingList, flattenShoppingList } from "./shoppingList";


const here = path.dirname(fileURLToPath(import.meta.url));
import type { UserProfile } from "./types";

const T1: UserProfile = {
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

const DEFAULT_BASKET = [
  "chicken-breast",
  "egg",
  "brown-rice",
  "oats",
  "broccoli",
  "tomato",
  "banana",
  "greek-yogurt",
  "olive-oil",
];

describe("recommendHealthyMeals", () => {
  it("空篮和默认 9 样都返回非空推荐", () => {
    const empty = recommendHealthyMeals(recipes, ingredients, T1, []);
    const filled = recommendHealthyMeals(
      recipes,
      ingredients,
      T1,
      DEFAULT_BASKET,
    );
    expect(empty.ready.length + empty.almost.length).toBeGreaterThan(0);
    expect(filled.ready.length + filled.almost.length).toBeGreaterThan(0);
    expect(filled.ready.length).toBeGreaterThan(0);
    for (const item of empty.almost) {
      expect(item.missingIds.length).toBeGreaterThan(0);
      const after = eligibleRecipes(
        recipes,
        T1,
        item.missingIds,
        ingredients,
      );
      expect(after.some((r) => r.id === item.recipe.id)).toBe(true);
    }
  });

  it("空宇宙下燕麦粥还缺 oats；默认 9 样不缺", () => {
    const oatmeal = recipes.find((row) => row.id === "microwave-egg-oatmeal");
    expect(oatmeal).toBeTruthy();
    if (!oatmeal) throw new Error("missing oatmeal");
    const catalogMissing = missingNonSeasoningIds(
      oatmeal,
      catalogIds(),
      ingredients,
    );
    expect(catalogMissing).not.toContain("oats");
    const emptyMissing = missingNonSeasoningIds(oatmeal, [], ingredients);
    expect(emptyMissing).toContain("oats");
    const basketMissing = missingNonSeasoningIds(
      oatmeal,
      DEFAULT_BASKET,
      ingredients,
    );
    expect(basketMissing).not.toContain("oats");
  });

  it("missingCookKind / missingCookLabel 可做、手头没有、还缺这些食材", () => {
    const shelf = new Set(["chicken-breast"]);
    expect(missingCookKind([], shelf)).toBe("ok");
    expect(missingCookLabel("ok")).toBe("可做");
    expect(missingCookKind(["oats"], shelf)).toBe("unavailable");
    expect(missingCookLabel("unavailable")).toBe("手头没有");
    expect(missingCookKind(["chicken-breast", "oats"], shelf)).toBe(
      "out_of_scope",
    );
    expect(missingCookLabel("out_of_scope")).toBe("还缺这些食材");
  });

  it("persist version 8，灵感页没有 HealthyRecommend", () => {
    const store = readFileSync(path.join(here, "../store/useAppStore.ts"), "utf8");
    const recipeList = readFileSync(
      path.join(here, "../app/recipes/page.tsx"),
      "utf8",
    );
    expect(store).toMatch(/name: "aislemeal:v1"/);
    expect(store).toMatch(/version: 8/);
    expect(recipeList).not.toMatch(/HealthyRecommend/);
  });

  it("还能做的菜确实可做，再勾列出的缺失勾上后可做", () => {
    const rec = recommendHealthyMeals(
      recipes,
      ingredients,
      T1,
      DEFAULT_BASKET,
    );
    const readyIds = new Set(
      eligibleRecipes(recipes, T1, DEFAULT_BASKET, ingredients).map((r) => r.id),
    );
    for (const item of rec.ready) {
      expect(readyIds.has(item.recipe.id)).toBe(true);
      expect(item.missingIds).toEqual([]);
    }
    for (const item of rec.almost) {
      expect(item.missingIds.length).toBeGreaterThan(0);
      for (const id of item.missingIds) {
        expect(DEFAULT_BASKET.includes(id)).toBe(false);
      }
      const after = eligibleRecipes(
        recipes,
        T1,
        [...DEFAULT_BASKET, ...item.missingIds],
        ingredients,
      );
      expect(after.some((r) => r.id === item.recipe.id)).toBe(true);
    }
  });

  it("同一篮里鸡胸蔬菜菜排在午餐肉或火腿肠之前", () => {
    const processedIds = ingredients
      .filter((item) => /午餐肉|火腿肠|烤肠|鸡爪/.test(item.name))
      .map((item) => item.id);
    expect(processedIds.length).toBeGreaterThan(0);
    const basket = [
      "chicken-breast",
      "brown-rice",
      "white-rice",
      "broccoli",
      "tomato",
      ...processedIds,
      ...ingredients.filter((item) => item.category === "seasoning").map((i) => i.id),
    ];
    const rec = recommendHealthyMeals(recipes, ingredients, T1, basket, {
      ready: recipes.length,
      almost: 0,
    });
    const chicken = rec.ready.find(
      (item) =>
        item.recipe.ingredients.some((row) => row.id === "chicken-breast") &&
        item.recipe.ingredients.some((row) => {
          const ing = ingredients.find((x) => x.id === row.id);
          return ing?.category === "veg";
        }),
    );
    const processed = rec.ready.find((item) =>
      item.recipe.ingredients.some((row) => processedIds.includes(row.id)),
    );
    expect(chicken).toBeTruthy();
    expect(processed).toBeTruthy();
    const chickenIdx = rec.ready.findIndex((item) => item.recipe.id === chicken!.recipe.id);
    const processedIdx = rec.ready.findIndex(
      (item) => item.recipe.id === processed!.recipe.id,
    );
    expect(chickenIdx).toBeLessThan(processedIdx);
  });

  it("一键健康篮对空选 1 天可行则 7 天也可行", () => {
    const suggested = suggestHealthyBasket(recipes, ingredients, T1, []);
    expect(suggested.ok).toBe(true);
    const ids = suggested.ids;
    const known = new Set(ingredients.map((item) => item.id));
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(known.has(id)).toBe(true);
      const ingredient = ingredients.find((item) => item.id === id);
      expect(isProcessedMeat(ingredient)).toBe(false);
    }
    const target = computeTarget(T1);
    const ctx = {
      profile: T1,
      ingredients,
      universe: new Set(ids),
    };
    expect(createMealPlan(recipes, target, 1, ctx).feasible).toBe(true);
    expect(createMealPlan(recipes, target, 7, ctx).feasible).toBe(true);
  });

  it("一键健康篮补齐不删已勾", () => {
    const kept = ["egg", "banana"];
    const suggested = suggestHealthyBasket(recipes, ingredients, T1, kept);
    expect(suggested.ok).toBe(true);
    expect(suggested.ids).toEqual(expect.arrayContaining(kept));
  });

  it("T1 空篮一键后排餐可行，且不是馄饨加拍黄瓜", () => {
    const suggested = suggestHealthyBasket(recipes, ingredients, T1, []);
    expect(suggested.ok).toBe(true);
    const ids = suggested.ids;
    for (const id of ids) {
      expect(isProcessedMeat(ingredients.find((item) => item.id === id))).toBe(
        false,
      );
    }
    const target = computeTarget(T1);
    const plan = createMealPlan(recipes, target, 7, {
      profile: T1,
      ingredients,
      universe: new Set(ids),
    });
    expect(plan.feasible).toBe(true);
    if (!plan.feasible) throw new Error("expected feasible");
    const list = flattenShoppingList(
      buildShoppingList(plan, [], ingredients, recipes, 7),
    );
    for (const line of list) {
      expect(
        isProcessedMeat(ingredients.find((item) => item.id === line.ingredientId)),
      ).toBe(false);
    }
    const names = plan.meals.map(
      (meal) => recipes.find((recipe) => recipe.id === meal.recipeId)?.name,
    );
    const unique = new Set(names);
    expect(
      unique.has("小馄饨早餐") && unique.has("拍黄瓜鸡胸餐"),
    ).toBe(false);
    const breakfasts = eligibleRecipes(recipes, T1, ids, ingredients).filter(
      (recipe) => recipe.mealSlots.includes("breakfast"),
    );
    const mains = eligibleRecipes(recipes, T1, ids, ingredients).filter(
      (recipe) =>
        recipe.mealSlots.includes("lunch") || recipe.mealSlots.includes("dinner"),
    );
    expect(breakfasts.length).toBeGreaterThan(1);
    expect(mains.length).toBeGreaterThan(1);
    expect(plan.dailyActual[0].kcal).toBeGreaterThanOrEqual(target.kcal * 0.7);
  });

  it("凑不出健康篮时返回失败合同", () => {
    const none = suggestHealthyBasket([], ingredients, T1, []);
    expect(none.ok).toBe(false);
    expect(none.ids).toEqual([]);
    expect(none.hint).toBeTruthy();
  });

  it("默认 9 样一键仍能排出可行篮", () => {
    const suggested = suggestHealthyBasket(
      recipes,
      ingredients,
      T1,
      DEFAULT_BASKET,
    );
    expect(suggested.ok).toBe(true);
    expect(suggested.ids).toEqual(expect.arrayContaining(["egg"]));
    const same =
      suggested.ids.length === DEFAULT_BASKET.length &&
      DEFAULT_BASKET.every((id) => suggested.ids.includes(id));
    expect(same).toBe(false);
  });

  it("只备晚餐时一键篮不因早餐失败", () => {
    const dinnerOnly: UserProfile = {
      ...T1,
      enabledSlots: ["dinner"],
      slotAbsences: {
        breakfast: { policy: "fold" },
        lunch: { policy: "reserve" },
      },
    };
    const noBreakfast = recipes.filter(
      (recipe) => !recipe.mealSlots.includes("breakfast"),
    );
    expect(
      noBreakfast.some((recipe) => recipe.mealSlots.includes("breakfast")),
    ).toBe(false);
    const suggested = suggestHealthyBasket(
      noBreakfast,
      ingredients,
      dinnerOnly,
      [],
    );
    expect(suggested.ok).toBe(true);
    expect(suggested.ids.length).toBeGreaterThan(0);
    const threeSlot = suggestHealthyBasket(noBreakfast, ingredients, T1, []);
    expect(threeSlot.ok).toBe(false);
    const target = computeTarget(dinnerOnly);
    expect(
      createMealPlan(noBreakfast, target, 1, {
        profile: dinnerOnly,
        ingredients,
        universe: new Set(suggested.ids),
      }).feasible,
    ).toBe(true);
  });

  it("只备晚餐/午餐在外一键篮不会按全日 0.7 去堆碳水", () => {
    const dumpCarbs = [
      "wonton",
      "rice-cake",
      "taro",
      "hand-grab-pancake",
    ] as const;
    const dinnerOnly: UserProfile = {
      ...T1,
      enabledSlots: ["dinner"],
      slotAbsences: {
        breakfast: { policy: "fold" },
        lunch: { policy: "reserve" },
      },
    };
    const lunchAway: UserProfile = {
      ...T1,
      enabledSlots: ["breakfast", "dinner"],
      slotAbsences: { lunch: { policy: "reserve" } },
    };

    for (const profile of [dinnerOnly, lunchAway]) {
      const suggested = suggestHealthyBasket(recipes, ingredients, profile, []);
      expect(suggested.ok).toBe(true);
      const full = computeTarget(profile);
      const remaining = remainingTarget(full, planSlotBudget(full, profile));
      const plan = createMealPlan(recipes, full, 1, {
        profile,
        ingredients,
        universe: new Set(suggested.ids),
      });
      expect(plan.feasible).toBe(true);
      if (!plan.feasible) throw new Error("expected feasible");
      expect(plan.dailyActual[0].kcal).toBeGreaterThanOrEqual(
        remaining.kcal * 0.7,
      );
      for (const id of dumpCarbs) {
        expect(suggested.ids).not.toContain(id);
      }
    }
  });

});

describe("previewHealthyBaskets", () => {
  it("默认 9 样预览双卡独立 ok，packCount 等于 sum(packs)", () => {
    const preview = previewHealthyBaskets({
      recipes,
      ingredients,
      profile: T1,
      currentIds: [...DEFAULT_BASKET],
      days: 7,
    });
    expect(preview.easy.ok).toBe(true);
    expect(preview.variety.ok).toBe(true);
    if (!preview.easy.ok || !preview.variety.ok) {
      throw new Error("expected both previews ok");
    }
    expect(preview.easy.style).toBe("easy");
    expect(preview.variety.style).toBe("variety");
    for (const card of [preview.easy, preview.variety]) {
      expect([...card.keepIds, ...card.addIds].sort()).toEqual([...card.ids].sort());
      expect([...card.keepIds, ...card.removeIds].sort()).toEqual(
        [...DEFAULT_BASKET].sort(),
      );
    }
    for (const id of [...preview.easy.addIds, ...preview.variety.addIds]) {
      expect(isProcessedMeat(ingredients.find((item) => item.id === id))).toBe(
        false,
      );
    }
    const easyPlan = createMealPlan(recipes, computeTarget(T1), 7, {
      profile: T1,
      ingredients,
      universe: new Set(preview.easy.ids),
      planStyle: "easy",
    });
    const varietyPlan = createMealPlan(recipes, computeTarget(T1), 7, {
      profile: T1,
      ingredients,
      universe: new Set(preview.variety.ids),
      planStyle: "variety",
    });
    expect(easyPlan.feasible).toBe(true);
    expect(varietyPlan.feasible).toBe(true);
    if (!easyPlan.feasible || !varietyPlan.feasible) {
      throw new Error("expected feasible plans");
    }
    const easyPacks = flattenShoppingList(
      buildShoppingList(easyPlan, [], ingredients, recipes, 7),
    ).reduce((sum, line) => sum + line.packs, 0);
    const varietyPacks = flattenShoppingList(
      buildShoppingList(varietyPlan, [], ingredients, recipes, 7),
    ).reduce((sum, line) => sum + line.packs, 0);
    expect(preview.easy.packCount).toBe(easyPacks);
    expect(preview.variety.packCount).toBe(varietyPacks);
    expect(preview.easy.uniquePlanned).toBe(
      new Set(easyPlan.meals.map((meal) => meal.recipeId)).size,
    );
    expect(preview.variety.uniquePlanned).toBe(
      new Set(varietyPlan.meals.map((meal) => meal.recipeId)).size,
    );
  });

  it("packCount 用同一 pantry 扣减", () => {
    const empty = previewHealthyBaskets({
      recipes,
      ingredients,
      profile: T1,
      currentIds: [...DEFAULT_BASKET],
      days: 7,
    });
    expect(empty.easy.ok).toBe(true);
    if (!empty.easy.ok) throw new Error("expected easy ok");
    const easyPlan = createMealPlan(recipes, computeTarget(T1), 7, {
      profile: T1,
      ingredients,
      universe: new Set(empty.easy.ids),
      planStyle: "easy",
    });
    expect(easyPlan.feasible).toBe(true);
    if (!easyPlan.feasible) throw new Error("expected feasible");
    const lines = flattenShoppingList(
      buildShoppingList(easyPlan, [], ingredients, recipes, 7),
    );
    expect(lines.length).toBeGreaterThan(0);
    const pantry = [
      { ingredientId: lines[0].ingredientId, grams: lines[0].needGrams + 50_000 },
    ];
    const withPantry = previewHealthyBaskets({
      recipes,
      ingredients,
      profile: T1,
      currentIds: [...DEFAULT_BASKET],
      days: 7,
      pantry,
    });
    expect(withPantry.easy.ok).toBe(true);
    if (!withPantry.easy.ok) throw new Error("expected easy ok");
    expect(withPantry.easy.ids).toEqual(empty.easy.ids);
    const pantryPacks = flattenShoppingList(
      buildShoppingList(easyPlan, pantry, ingredients, recipes, 7),
    ).reduce((sum, line) => sum + line.packs, 0);
    expect(withPantry.easy.packCount).toBe(pantryPacks);
    expect(pantryPacks).toBeLessThan(empty.easy.packCount ?? 0);
  });

  it("已勾加工肉保留，不会勾上新的加工肉", () => {
    const processed = ingredients.find((item) => isProcessedMeat(item));
    expect(processed).toBeTruthy();
    if (!processed) throw new Error("missing processed meat");
    const current = [...DEFAULT_BASKET, processed.id];
    const preview = previewHealthyBaskets({
      recipes,
      ingredients,
      profile: T1,
      currentIds: current,
      days: 7,
    });
    expect(preview.easy.ok).toBe(true);
    expect(preview.variety.ok).toBe(true);
    expect(preview.easy.ids).toEqual(expect.arrayContaining([processed.id]));
    expect(preview.variety.ids).toEqual(expect.arrayContaining([processed.id]));
    for (const card of [preview.easy, preview.variety]) {
      expect(card.removeIds).not.toContain(processed.id);
      for (const id of card.addIds) {
        expect(isProcessedMeat(ingredients.find((item) => item.id === id))).toBe(
          false,
        );
      }
    }
  });

  it("全库买得到按 catalog 不是当前篮", () => {
    const recipe = recipes.find(
      (item) => item.id === "microwave-chicken-broccoli-box",
    );
    expect(recipe).toBeTruthy();
    const catalog = catalogIds();
    const basket = new Set(["egg", "brown-rice"]);
    expect(catalog.has("chicken-breast")).toBe(true);
    expect(basket.has("chicken-breast")).toBe(false);
    expect(
      missingNonSeasoningIds(recipe!, basket, ingredients).length,
    ).toBeGreaterThan(0);
    expect(missingNonSeasoningIds(recipe!, catalog, ingredients)).toEqual([]);
  });

  it("空食谱两卡独立失败", () => {
    const preview = previewHealthyBaskets({
      recipes: [],
      ingredients,
      profile: T1,
      currentIds: [...DEFAULT_BASKET],
      days: 7,
    });
    expect(preview.easy.ok).toBe(false);
    expect(preview.variety.ok).toBe(false);
    expect(preview.easy.style).toBe("easy");
    expect(preview.variety.style).toBe("variety");
    expect(preview.easy).not.toBe(preview.variety);
    expect(preview.easy.packCount).toBeUndefined();
    expect(preview.variety.packCount).toBeUndefined();
  });
});
