import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
import {
  mainGridIngredients,
  ORIGINAL_INGREDIENT_IDS,
  SHELF_CORRECTION_IDS,
} from "./basketGrid";
import { ingredients, recipes } from "./data";
import originalPer100g from "./ingredientPer100g.lock.json";
import originalRecipeIds from "./originalRecipeIds.lock.json";
import catalogIdList from "../generated/catalog-ids.json";
import { computeTarget, recipeMacros } from "./nutrition";
import { createMealPlan, eligibleRecipes } from "./planner";
import { ingredientSchema, recipeSchema } from "./schemas";
import type { UserProfile } from "./types";

const PRUNED_INGREDIENT_IDS = [
  "cake-flour",
  "gelatin-sheet",
  "instant-yeast",
  "baking-powder",
  "powdered-sugar",
  "whipping-cream",
  "condensed-milk",
  "red-bean-paste",
  "glutinous-rice-flour",
  "coconut-flakes",
  "osmanthus-syrup",
  "hawthorn-cake",
  "pork-floss",
  "milk-powder",
  "wasabi-sauce",
  "egg-tart-shell",
] as const;

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

describe("data integrity", () => {
  it("全部食材通过 schema", () => {
    for (const item of ingredients) {
      expect(ingredientSchema.parse(item).id).toBe(item.id);
    }
  });

  it("全部食谱通过 schema", () => {
    for (const recipe of recipes) {
      expect(recipeSchema.parse(recipe).id).toBe(recipe.id);
    }
  });

  it("食谱食材引用完整", () => {
    const ids = new Set(ingredients.map((i) => i.id));
    for (const recipe of recipes) {
      for (const item of recipe.ingredients) {
        expect(ids.has(item.id), `${recipe.id} → ${item.id}`).toBe(true);
      }
    }
  });

  it("燕麦酸奶能量杯配料与步骤一致且无重复 id", () => {
    const cup = recipes.find((recipe) => recipe.id === "oat-yogurt-cup");
    expect(cup).toBeTruthy();
    if (!cup) return;
    const ids = cup.ingredients.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    const hasNuts = cup.ingredients.some((item) => item.id === "mixed-nuts");
    if (!hasNuts) {
      for (const step of cup.steps) {
        expect(step).not.toMatch(/混合坚果/);
      }
    }
  });

  it("跟做配料列表 key 不只用 item.id", () => {
    const src = readFileSync(path.join(here, "../app/cook/page.tsx"), "utf8");
    expect(src).not.toMatch(/<li key=\{item\.id\}>/);
  });

  it("食材通用名，不含店招或品牌货架全文", () => {
    for (const item of ingredients) {
      expect(item.name, item.id).not.toMatch(/小象|象大厨/);
      expect(item.popularity).toBeGreaterThanOrEqual(1);
    }
    const yogurt = ingredients.find((item) => item.id === "greek-yogurt");
    const milk = ingredients.find((item) => item.id === "skim-milk");
    const pasta = ingredients.find((item) => item.id === "wholewheat-pasta");
    const tofu = ingredients.find((item) => item.id === "firm-tofu");
    expect(yogurt?.name).toMatch(/希腊酸奶/);
    expect(milk?.name).toMatch(/脱脂/);
    expect(pasta?.name).toMatch(/全麦/);
    expect(tofu?.name).toMatch(/老豆腐|北豆腐/);
  });

  it("原 53 条 per100g 未改", () => {
    for (const [id, locked] of Object.entries(originalPer100g)) {
      const item = ingredients.find((row) => row.id === id);
      expect(item, id).toBeTruthy();
      expect(item?.per100g).toEqual(locked);
    }
    expect(Object.keys(originalPer100g)).toHaveLength(53);
  });

  it("祖父 lock 120 且无 egg-tart-yogurt", () => {
    expect(originalRecipeIds).toHaveLength(120);
    expect(originalRecipeIds).not.toContain("egg-tart-yogurt");
    const current = new Set(recipes.map((recipe) => recipe.id));
    const lock = new Set(originalRecipeIds);
    expect(lock.size).toBe(120);
    for (const id of originalRecipeIds) {
      expect(current.has(id), id).toBe(true);
    }
    expect(current.has("egg-tart-yogurt")).toBe(false);
  });

  it("免开火步骤不下锅", () => {
    for (const recipe of recipes) {
      if (recipe.equipment.length > 0) continue;
      for (const step of recipe.steps) {
        expect(step, recipe.id).not.toMatch(/下锅/);
      }
    }
  });

  it("0.4 具名删 16 条 id 不存在", () => {
    const ids = new Set(ingredients.map((item) => item.id));
    for (const id of PRUNED_INGREDIENT_IDS) {
      expect(ids.has(id), id).toBe(false);
    }
  });

  it("菜谱数量、餐位和默认篮可行性", () => {
    expect(recipes.length).toBeGreaterThanOrEqual(200);
    expect(recipes.length).toBeLessThanOrEqual(250);
    expect(recipes.filter((r) => r.mealSlots.includes("breakfast")).length).toBeGreaterThanOrEqual(40);
    expect(recipes.filter((r) => r.mealSlots.includes("lunch")).length).toBeGreaterThanOrEqual(80);
    expect(recipes.filter((r) => r.mealSlots.includes("dinner")).length).toBeGreaterThanOrEqual(80);

    const target = computeTarget(T1);
    const ctx = {
      profile: T1,
      ingredients,
      universe: new Set(DEFAULT_BASKET),
    };
    expect(createMealPlan(recipes, target, 1, ctx).feasible).toBe(true);
    expect(createMealPlan(recipes, target, 7, ctx).feasible).toBe(true);

    const protein = ingredients.find((item) => item.id === "chicken-breast");
    const carb = ingredients.find((item) => item.id === "brown-rice");
    const vegA = ingredients.find((item) => item.id === "broccoli");
    const vegB = ingredients.find((item) => item.id === "tomato");
    expect(protein && carb && vegA && vegB).toBeTruthy();
    const seasoningIds = ingredients
      .filter((item) => item.category === "seasoning")
      .map((item) => item.id);
    const comboBasket = [
      protein!.id,
      carb!.id,
      vegA!.id,
      vegB!.id,
      ...seasoningIds,
    ];
    const breakfasts = eligibleRecipes(recipes, T1, [...DEFAULT_BASKET], ingredients).filter(
      (recipe) => recipe.mealSlots.includes("breakfast"),
    );
    expect(breakfasts.length).toBeGreaterThanOrEqual(4);

    const lunchDinner = eligibleRecipes(
      recipes,
      T1,
      [...DEFAULT_BASKET],
      ingredients,
    ).filter(
      (recipe) =>
        recipe.mealSlots.includes("lunch") || recipe.mealSlots.includes("dinner"),
    );
    const cloneSet = new Set(["chicken-breast", "brown-rice", "broccoli"]);
    for (const recipe of lunchDinner) {
      const nonSeasoning = recipe.ingredients
        .map((row) => row.id)
        .filter((id) => {
          const ing = ingredients.find((item) => item.id === id);
          return ing?.category !== "seasoning";
        });
      expect(new Set(nonSeasoning)).not.toEqual(cloneSet);
    }

    const storeUniverse = ingredients.map((item) => item.id);
    const failCloseFreeBreakfasts = eligibleRecipes(
      recipes,
      T1,
      storeUniverse,
      ingredients,
    ).filter((recipe) => recipe.mealSlots.includes("breakfast"));
    expect(failCloseFreeBreakfasts.length).toBeGreaterThanOrEqual(2);

    expect(
      eligibleRecipes(recipes, T1, comboBasket, ingredients).length,
    ).toBeGreaterThanOrEqual(5);
  });

  it("主网格不含零菜谱新条且保留原 53", () => {
    const main = mainGridIngredients(ingredients, recipes);
    const mainIds = new Set(main.map((item) => item.id));
    for (const id of ORIGINAL_INGREDIENT_IDS) {
      expect(mainIds.has(id), id).toBe(true);
    }
    const referenced = new Set(
      recipes.flatMap((recipe) => recipe.ingredients.map((row) => row.id)),
    );
    for (const id of SHELF_CORRECTION_IDS) {
      expect(mainIds.has(id), id).toBe(true);
    }
    expect(mainIds.has("chicken-feet")).toBe(true);
    expect(mainIds.has("whole-milk")).toBe(true);
    for (const item of ingredients) {
      if (ORIGINAL_INGREDIENT_IDS.has(item.id)) continue;
      if ((SHELF_CORRECTION_IDS as readonly string[]).includes(item.id)) continue;
      if (referenced.has(item.id)) continue;
      expect(mainIds.has(item.id), item.id).toBe(false);
    }
  });

  it("牛奶蜂蜜鸡爪是通用包装", () => {
    const milk = ingredients.find((item) => item.id === "whole-milk");
    const honey = ingredients.find((item) => item.id === "honey");
    const feet = ingredients.find((item) => item.id === "chicken-feet");
    expect(milk?.name).toMatch(/纯牛奶/);
    expect(milk?.pack.size).toBeLessThanOrEqual(1000);
    expect(honey?.pack.size).toBeGreaterThan(12);
    expect(feet?.name).toMatch(/鸡爪/);
    expect(feet?.pack.size).toBeLessThan(1000);
  });

  it("排餐换一道展示 alternativesFor 列表而不是只循环下一项", () => {
    const src = readFileSync(path.join(here, "../app/plan/page.tsx"), "utf8");
    expect(src).toMatch(/alternativesFor/);
    expect(src).toMatch(/没有可换的菜/);
    expect(src).not.toMatch(/\(idx \+ 1\) % ring\.length/);
    expect(src).not.toMatch(/ring\.splice/);
  });

  it("每道食谱营养可算且 kcal ∈ [200, 900]", () => {
    const byId = new Map(ingredients.map((i) => [i.id, i]));
    for (const recipe of recipes) {
      const macros = recipeMacros(recipe, byId);
      expect(Number.isFinite(macros.kcal)).toBe(true);
      expect(macros.kcal).toBeGreaterThanOrEqual(200);
      expect(macros.kcal).toBeLessThanOrEqual(900);
    }
  });

  it("新菜非调味都在库里，并满足配额", () => {
    const lock = new Set(originalRecipeIds);
    const catalog = new Set(catalogIdList as string[]);
    const fruit = new Set([
      "banana",
      "mango",
      "pineapple",
      "dragon-fruit",
      "nectarine",
      "orange",
      "hami-melon",
      "lychee",
      "watermelon",
    ]);
    const noodleIds = new Set([
      "fresh-noodle",
      "rice-cake",
      "wonton",
      "egg-noodle",
      "mung-vermicelli",
    ]);
    const plantProtein = new Set([
      "firm-tofu",
      "silken-tofu",
      "egg",
      "golden-goose-egg",
    ]);
    const byId = new Map(ingredients.map((item) => [item.id, item]));
    const fresh = recipes.filter((recipe) => !lock.has(recipe.id));
    expect(fresh.length).toBeGreaterThan(0);
    const tuples = new Set<string>();
    let breakfasts = 0;
    let appliance = 0;
    let plantMeals = 0;
    let noodleMeals = 0;
    let packed = 0;
    let chickenRiceVeg = 0;
    for (const recipe of fresh) {
      const nonSeasoning = recipe.ingredients
        .map((row) => row.id)
        .filter((id) => byId.get(id)?.category !== "seasoning");
      const uniqueNon = [...new Set(nonSeasoning)];
      for (const id of uniqueNon) {
        expect(catalog.has(id), `${recipe.id} not in catalog ${id}`).toBe(true);
      }
      const tuple = [...uniqueNon].sort().join(",");
      expect(tuples.has(tuple), `duplicate tuple ${recipe.id}`).toBe(false);
      tuples.add(tuple);
      const yogurtCup =
        (uniqueNon.includes("greek-yogurt") || /酸奶/.test(recipe.name)) &&
        uniqueNon.some((id) => fruit.has(id));
      expect(yogurtCup, recipe.id).toBe(false);
      if (
        recipe.mealSlots.includes("breakfast") &&
        !yogurtCup &&
        !uniqueNon.includes("greek-yogurt")
      ) {
        breakfasts += 1;
      }
      const eq = [...recipe.equipment].sort().join(",");
      if (
        (recipe.mealSlots.includes("lunch") ||
          recipe.mealSlots.includes("dinner")) &&
        (eq === "microwave" || eq === "airfryer")
      ) {
        appliance += 1;
      }
      const hasBannedMeat =
        uniqueNon.includes("chicken-breast") || uniqueNon.includes("pork-belly");
      const plant =
        uniqueNon.some((id) => plantProtein.has(id)) ||
        (uniqueNon.some((id) => byId.get(id)?.category === "veg") &&
          !hasBannedMeat &&
          !uniqueNon.some((id) => byId.get(id)?.category === "protein"));
      if (
        plant &&
        (recipe.mealSlots.includes("lunch") ||
          recipe.mealSlots.includes("dinner"))
      ) {
        plantMeals += 1;
      }
      if (uniqueNon.some((id) => noodleIds.has(id))) noodleMeals += 1;
      if (recipe.tags.includes("带饭") || recipe.tags.includes("可复热")) {
        packed += 1;
      }
      if (
        recipe.mealSlots.includes("lunch") ||
        recipe.mealSlots.includes("dinner")
      ) {
        const set = new Set(uniqueNon);
        const extras = [...set].filter(
          (id) =>
            id !== "chicken-breast" &&
            id !== "brown-rice" &&
            byId.get(id)?.category !== "veg",
        );
        if (
          set.has("chicken-breast") &&
          set.has("brown-rice") &&
          extras.length === 0
        ) {
          chickenRiceVeg += 1;
        }
      }
    }
    expect(breakfasts).toBeGreaterThanOrEqual(15);
    expect(appliance).toBeGreaterThanOrEqual(20);
    expect(plantMeals).toBeGreaterThanOrEqual(20);
    expect(noodleMeals).toBeGreaterThanOrEqual(15);
    expect(packed).toBeGreaterThanOrEqual(9);
    expect(chickenRiceVeg).toBeLessThanOrEqual(5);
  });
});
