import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ingredients, ingredientsById, recipes } from "./data";
import {
  computeTarget,
  inTargetBand,
  planSlotBudget,
  recipeMacros,
  remainingTarget,
  slotTargets,
} from "./nutrition";
import { nutritionGate } from "./nutritionGate";
import { catalogIds } from "./availability";
import {
  alternativesFor,
  applyMicroAdjust,
  buildPlan,
  collapseMicroAdjust,
  cookableRecipes,
  createMealPlan,
  eligibleRecipes,
  explainMealChoice,
  replaceMeal,
  wantedChipBadge,
  REPEAT_BAND,
  scoreRecipe,
  summarizePlanDiversity,
} from "./planner";
import type { Ingredient, Macros, MealPlan, Recipe, UserProfile } from "./types";

const here = path.dirname(fileURLToPath(import.meta.url));

/** easy / omitted planStyle must match this HEAD createMealPlan sequence. */
const HEAD_EASY_7D_MEAL_IDS = [
  "microwave-egg-oatmeal",
  "microwave-chicken-broccoli-box",
  "microwave-chicken-broccoli-box",
  "microwave-egg-oatmeal",
  "microwave-chicken-broccoli-box",
  "microwave-chicken-broccoli-box",
  "microwave-egg-oatmeal",
  "microwave-chicken-broccoli-box",
  "microwave-chicken-broccoli-box",
  "microwave-egg-oatmeal",
  "microwave-chicken-broccoli-box",
  "microwave-chicken-broccoli-box",
  "microwave-egg-oatmeal",
  "microwave-chicken-broccoli-box",
  "microwave-chicken-broccoli-box",
  "microwave-egg-oatmeal",
  "microwave-chicken-broccoli-box",
  "microwave-chicken-broccoli-box",
  "microwave-egg-oatmeal",
  "microwave-chicken-broccoli-box",
  "microwave-chicken-broccoli-box",
] as const;

const SPEC_DEFAULT_BASKET = [
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

const ALL_UNIVERSE = new Set(ingredients.map((item) => item.id));
const DEFAULT_UNIVERSE = new Set(SPEC_DEFAULT_BASKET);

const fullProfile: UserProfile = {
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

describe("createMealPlan", () => {
  it("全库+全厨具+3 天可行，营养约束成立", () => {
    const target = computeTarget(fullProfile);
    const plan = createMealPlan(recipes, target, 3, {
      profile: fullProfile,
      ingredients,
      universe: ALL_UNIVERSE,
    });
    expect(plan.feasible).toBe(true);
    if (!plan.feasible) throw new Error("expected feasible");

    for (const actual of plan.dailyActual) {
      expect(Math.abs(actual.kcal - target.kcal) / target.kcal).toBeLessThanOrEqual(
        0.15,
      );
      expect(actual.protein).toBeLessThanOrEqual(target.protein * 1.1);
      expect(actual.kcal).toBeLessThanOrEqual(target.kcal * 1.1);
    }
  });

  it("默认 9 样 1 天可行则 7 天也可行", () => {
    const target = computeTarget(fullProfile);
    const ctx = {
      profile: fullProfile,
      ingredients,
      basketIds: [...SPEC_DEFAULT_BASKET],
      universe: DEFAULT_UNIVERSE,
    };
    const one = createMealPlan(recipes, target, 1, ctx);
    const seven = createMealPlan(recipes, target, 7, ctx);
    expect(one.feasible).toBe(true);
    expect(seven.feasible).toBe(true);
  });

  it("SPEC 默认 9 样 + T1 + 3 天可行", () => {
    const target = computeTarget(fullProfile);
    const plan = createMealPlan(recipes, target, 3, {
      profile: fullProfile,
      ingredients,
      universe: DEFAULT_UNIVERSE,
    });
    expect(plan.feasible).toBe(true);
    if (!plan.feasible) throw new Error("expected feasible");
    for (const actual of plan.dailyActual) {
      expect(actual.protein).toBeLessThanOrEqual(target.protein * 1.1);
      expect(actual.kcal).toBeLessThanOrEqual(target.kcal * 1.1);
    }
  });

  it("全库+全厨具+7 天可行", () => {
    const target = computeTarget(fullProfile);
    const plan = createMealPlan(recipes, target, 7, {
      profile: fullProfile,
      ingredients,
      universe: ALL_UNIVERSE,
    });
    expect(plan.feasible).toBe(true);
  });

  it("同日同食材微调合并为一行", () => {
    const merged = collapseMicroAdjust([
      { day: 1, ingredientId: "whey-protein", grams: 30, reason: "补 24g 蛋白" },
      { day: 1, ingredientId: "whey-protein", grams: 30, reason: "补 24g 蛋白" },
      { day: 0, ingredientId: "banana", grams: 80, reason: "补 98 kcal" },
    ]);
    expect(merged).toEqual([
      { day: 1, ingredientId: "whey-protein", grams: 60, reason: "补 48g 蛋白" },
      { day: 0, ingredientId: "banana", grams: 80, reason: "补 98 kcal" },
    ]);

    const target = computeTarget(fullProfile);
    const plan = createMealPlan(recipes, target, 3, {
      profile: fullProfile,
      ingredients,
      universe: new Set([...SPEC_DEFAULT_BASKET, "whey-protein"]),
    });
    expect(plan.feasible).toBe(true);
    if (!plan.feasible) throw new Error("expected feasible");
    const keys = plan.microAdjust.map((item) => `${item.day}:${item.ingredientId}`);
    expect(new Set(keys).size).toBe(keys.length);

    const empty = { kcal: 0, protein: 0, fat: 0, carb: 0 };
    const adjusted = applyMicroAdjust(
      {
        days: 1,
        meals: [],
        dailyActual: [empty],
        microAdjust: [],
        feasible: true,
      },
      target,
      {
        profile: fullProfile,
        ingredients,
        universe: new Set(["whey-protein", "banana"]),
      },
    );
    const whey = adjusted.microAdjust.filter(
      (item) => item.day === 0 && item.ingredientId === "whey-protein",
    );
    expect(whey.length).toBeGreaterThan(0);
  });

  it("换一道列出候选且 replaceMeal 改变当天实际营养", () => {
    const target = computeTarget(fullProfile);
    const ctx = {
      profile: fullProfile,
      ingredients,
      basketIds: [...SPEC_DEFAULT_BASKET],
      universe: DEFAULT_UNIVERSE,
    };
    const plan = createMealPlan(recipes, target, 3, ctx);
    expect(plan.feasible).toBe(true);
    if (!plan.feasible) throw new Error("expected feasible");
    const candidates = eligibleRecipes(
      recipes,
      fullProfile,
      ctx.basketIds,
      ingredients,
    );
    const alts = alternativesFor(plan, 0, "breakfast", candidates, target, ctx);
    expect(alts.length).toBeGreaterThan(0);
    const before = plan.dailyActual[0];
    const next = replaceMeal(
      plan,
      0,
      "breakfast",
      alts[0].id,
      candidates,
      target,
      ctx,
      recipes,
    );
    expect(next.feasible).toBe(true);
    expect(next.meals.find((m) => m.day === 0 && m.slot === "breakfast")?.recipeId).toBe(
      alts[0].id,
    );
    expect(next.dailyActual[0]).not.toEqual(before);
  });

  it("replaceMeal candidates 缺次日菜时 catalog 仍保住次日宏量", () => {
    const target = computeTarget(fullProfile);
    const ctx = {
      profile: fullProfile,
      ingredients,
      universe: new Set([
        "chicken-breast",
        "egg",
        "brown-rice",
        "broccoli",
        "tomato",
        "olive-oil",
      ]),
    };
    const breakfast = recipes.find((row) => row.id === "microwave-egg-oatmeal");
    const main = recipes.find((row) => row.id === "microwave-chicken-broccoli-box");
    const alt = recipes.find((row) => row.id === "tomato-egg-sandwich");
    expect(breakfast && main && alt).toBeTruthy();
    if (!breakfast || !main || !alt) throw new Error("missing recipes");
    const plan: MealPlan = {
      days: 2,
      meals: [
        { day: 0, slot: "breakfast", recipeId: breakfast.id },
        { day: 0, slot: "lunch", recipeId: main.id },
        { day: 0, slot: "dinner", recipeId: main.id },
        { day: 1, slot: "breakfast", recipeId: main.id },
        { day: 1, slot: "lunch", recipeId: main.id },
        { day: 1, slot: "dinner", recipeId: main.id },
      ],
      dailyActual: [
        { kcal: 1, protein: 1, fat: 1, carb: 1 },
        { kcal: 1, protein: 1, fat: 1, carb: 1 },
      ],
      microAdjust: [],
      feasible: true,
    };
    const candidates = [breakfast, alt];
    expect(candidates.some((row) => row.id === main.id)).toBe(false);
    const withoutCatalog = replaceMeal(
      plan,
      0,
      "breakfast",
      alt.id,
      candidates,
      target,
      ctx,
    );
    expect(withoutCatalog.dailyActual[1].kcal).toBe(0);
    const withCatalog = replaceMeal(
      plan,
      0,
      "breakfast",
      alt.id,
      candidates,
      target,
      ctx,
      recipes,
    );
    expect(withCatalog.dailyActual[1].kcal).toBeGreaterThan(0);
    expect(
      withCatalog.meals.find((m) => m.day === 1 && m.slot === "lunch")?.recipeId,
    ).toBe(main.id);
  });

  it("营养条颜色跟实际/目标比例走，换一道会改当天数字", () => {
    const target = computeTarget(fullProfile);
    expect(inTargetBand(target.kcal, target.kcal)).toBe(true);
    expect(inTargetBand(target.protein, target.protein)).toBe(true);
    const ctx = {
      profile: fullProfile,
      ingredients,
      basketIds: [...SPEC_DEFAULT_BASKET],
      universe: DEFAULT_UNIVERSE,
    };
    const plan = createMealPlan(recipes, target, 3, ctx);
    expect(plan.feasible).toBe(true);
    if (!plan.feasible) throw new Error("expected feasible");
    const day0 = plan.dailyActual[0];
    const fatRatio = day0.fat / target.fat;
    const carbRatio = day0.carb / target.carb;
    if (!inTargetBand(day0.fat, target.fat)) {
      expect(fatRatio < 0.9 || fatRatio > 1.1).toBe(true);
    }
    if (!inTargetBand(day0.carb, target.carb)) {
      expect(carbRatio < 0.9 || carbRatio > 1.1).toBe(true);
    }
    const candidates = eligibleRecipes(
      recipes,
      fullProfile,
      ctx.basketIds,
      ingredients,
    );
    const alts = alternativesFor(plan, 0, "breakfast", candidates, target, ctx);
    expect(alts.length).toBeGreaterThan(0);
    const swapped = replaceMeal(plan, 0, "breakfast", alts[0].id, candidates, target, ctx);
    expect(swapped.dailyActual[0]).not.toEqual(day0);
  });

  it("微调份必须在 universe 内，whey 用例含 whey-protein", () => {
    const target = computeTarget(fullProfile);
    const empty = { kcal: 0, protein: 0, fat: 0, carb: 0 };
    const withWhey = new Set(["whey-protein", "banana"]);
    const adjusted = applyMicroAdjust(
      {
        days: 1,
        meals: [],
        dailyActual: [empty],
        microAdjust: [],
        feasible: true,
      },
      target,
      { profile: fullProfile, ingredients, universe: withWhey },
    );
    expect(adjusted.microAdjust.length).toBeGreaterThan(0);
    expect(
      adjusted.microAdjust.some((item) => item.ingredientId === "whey-protein"),
    ).toBe(true);
    for (const item of adjusted.microAdjust) {
      expect(withWhey.has(item.ingredientId)).toBe(true);
    }

    const bananaOnly = new Set(["banana"]);
    const noWhey = applyMicroAdjust(
      {
        days: 1,
        meals: [],
        dailyActual: [empty],
        microAdjust: [],
        feasible: true,
      },
      target,
      { profile: fullProfile, ingredients, universe: bananaOnly },
    );
    expect(noWhey.microAdjust.length).toBeGreaterThan(0);
    for (const item of noWhey.microAdjust) {
      expect(item.ingredientId).toBe("banana");
    }

    const planUniverse = new Set([
      ...SPEC_DEFAULT_BASKET,
      "whey-protein",
    ]);
    const plan = createMealPlan(recipes, target, 3, {
      profile: fullProfile,
      ingredients,
      universe: planUniverse,
    });
    if (plan.feasible) {
      for (const item of plan.microAdjust) {
        expect(planUniverse.has(item.ingredientId)).toBe(true);
      }
    }
  });

  it("篮子只有 egg + white-rice 时不可行且给出 3 条补充建议", () => {
    const target = computeTarget(fullProfile);
    const plan = createMealPlan(recipes, target, 3, {
      profile: fullProfile,
      ingredients,
      universe: new Set(["egg", "white-rice"]),
    });
    expect(plan.feasible).toBe(false);
    if (plan.feasible) return;
    expect(plan.suggestions).toHaveLength(3);
  });
});

describe("planStyle easy/variety", () => {
  const ctx = {
    profile: fullProfile,
    ingredients,
    basketIds: [...SPEC_DEFAULT_BASKET],
    universe: DEFAULT_UNIVERSE,
  };

  it("省略或 easy 的 21 个 recipeId 等于捕获的 HEAD 序列", () => {
    const target = computeTarget(fullProfile);
    const omitted = createMealPlan(recipes, target, 7, ctx);
    const easy = createMealPlan(recipes, target, 7, {
      ...ctx,
      planStyle: "easy",
    });
    expect(omitted.feasible).toBe(true);
    expect(easy.feasible).toBe(true);
    if (!omitted.feasible || !easy.feasible) {
      throw new Error("expected feasible");
    }
    expect(omitted.meals.map((meal) => meal.recipeId)).toEqual([
      ...HEAD_EASY_7D_MEAL_IDS,
    ]);
    expect(easy.meals.map((meal) => meal.recipeId)).toEqual([
      ...HEAD_EASY_7D_MEAL_IDS,
    ]);
  });

  it("variety unique 大于 easy，两者可行，日热量带宽成立", () => {
    const target = computeTarget(fullProfile);
    const easy = createMealPlan(recipes, target, 7, {
      ...ctx,
      planStyle: "easy",
    });
    const variety = createMealPlan(recipes, target, 7, {
      ...ctx,
      planStyle: "variety",
    });
    expect(easy.feasible).toBe(true);
    expect(variety.feasible).toBe(true);
    if (!easy.feasible || !variety.feasible) {
      throw new Error("expected feasible");
    }
    const easyDiv = summarizePlanDiversity(easy);
    const varietyDiv = summarizePlanDiversity(variety);
    expect(varietyDiv.unique).toBeGreaterThan(easyDiv.unique);
    expect(easyDiv.unique).toBe(new Set(easy.meals.map((m) => m.recipeId)).size);
    expect(varietyDiv.unique).toBe(
      new Set(variety.meals.map((m) => m.recipeId)).size,
    );
    expect(easyDiv.repeatMeals).toBe(easy.meals.length - easyDiv.unique);
    expect(varietyDiv.repeatMeals).toBe(
      variety.meals.length - varietyDiv.unique,
    );
    for (let day = 0; day < 7; day += 1) {
      const kcalE = easy.dailyActual[day].kcal;
      const kcalV = variety.dailyActual[day].kcal;
      expect(Math.abs(kcalV - kcalE) / target.kcal).toBeLessThanOrEqual(0.2);
      expect(kcalV).toBeGreaterThanOrEqual(target.kcal * 0.7);
    }
  });

  it("某槽只有 1 道候选时 easy 与 variety 同一 id", () => {
    const target = computeTarget(fullProfile);
    const breakfast = recipes.find((recipe) =>
      recipe.mealSlots.includes("breakfast"),
    );
    const lunch = recipes.find((recipe) => recipe.mealSlots.includes("lunch"));
    const dinner = recipes.find(
      (recipe) =>
        recipe.mealSlots.includes("dinner") && recipe.id !== lunch?.id,
    );
    expect(breakfast && lunch && dinner).toBeTruthy();
    if (!breakfast || !lunch || !dinner) {
      throw new Error("missing slot recipes");
    }
    const candidates: Recipe[] = [breakfast, lunch, dinner];
    const oneCtx = {
      profile: fullProfile,
      ingredients,
      universe: ALL_UNIVERSE,
    };
    const easy = buildPlan(candidates, target, 3, {
      ...oneCtx,
      planStyle: "easy",
    });
    const variety = buildPlan(candidates, target, 3, {
      ...oneCtx,
      planStyle: "variety",
    });
    expect(easy.feasible).toBe(true);
    expect(variety.feasible).toBe(true);
    if (!easy.feasible || !variety.feasible) {
      throw new Error("expected feasible");
    }
    expect(easy.meals.map((meal) => meal.recipeId)).toEqual(
      variety.meals.map((meal) => meal.recipeId),
    );
  });

  it("variety 带宽含 best+0.35，超出不进，槽内最少已用优先", () => {
    const target = computeTarget(fullProfile);
    const macros: Macros = { kcal: 200, protein: 20, fat: 8, carb: 12 };
    const protein: Ingredient = {
      id: "band-p",
      name: "band-p",
      category: "protein",
      per100g: macros,
      pack: { size: 100, unit: "g", label: "袋" },
      storage: { fridgeDays: 30, freezable: true },
      source: "t",
      popularity: 1,
    };
    function meal(id: string, grams: number): Recipe {
      return {
        id,
        name: id,
        mealSlots: ["breakfast", "lunch", "dinner"],
        equipment: [],
        timeMinutes: 5,
        difficulty: 1,
        ingredients: [{ id: "band-p", grams }],
        steps: ["x"],
        tags: [],
      };
    }
    const best = meal("r-a", 100);
    const twin = meal("r-b", 100);
    let farGrams = 140;
    let far = meal("r-c", farGrams);
    const byId = new Map([["band-p", protein]]);
    const lunchTarget = slotTargets(target, "lunch");
    const bestScore = scoreRecipe(best, lunchTarget, 0, 2, byId);
    while (
      scoreRecipe(far, lunchTarget, 0, 2, byId) <= bestScore + REPEAT_BAND &&
      farGrams < 800
    ) {
      farGrams += 20;
      far = meal("r-c", farGrams);
    }
    expect(
      scoreRecipe(far, lunchTarget, 0, 2, byId),
    ).toBeGreaterThan(bestScore + REPEAT_BAND);
    expect(
      scoreRecipe(twin, lunchTarget, 0, 2, byId),
    ).toBeLessThanOrEqual(bestScore + REPEAT_BAND);
    const pool = [best, twin, far];
    const ctx = {
      profile: fullProfile,
      ingredients: [protein],
      universe: new Set(["band-p"]),
    };
    const easy = buildPlan(pool, target, 3, { ...ctx, planStyle: "easy" });
    const variety = buildPlan(pool, target, 3, { ...ctx, planStyle: "variety" });
    expect(easy.feasible).toBe(true);
    expect(variety.feasible).toBe(true);
    if (!easy.feasible || !variety.feasible) {
      throw new Error("expected feasible");
    }
    const lunches = variety.meals
      .filter((m) => m.slot === "lunch")
      .map((m) => m.recipeId);
    expect(lunches).toEqual(["r-a", "r-b", "r-a"]);
    expect(variety.meals.every((m) => m.recipeId !== "r-c")).toBe(true);
    expect(
      easy.meals.filter((m) => m.slot === "lunch").map((m) => m.recipeId),
    ).toEqual(["r-a", "r-a", "r-a"]);
  });

  it("explainMealChoice 省事重复昨天；否则用上已选", () => {
    const target = computeTarget(fullProfile);
    const plan = createMealPlan(recipes, target, 2, {
      ...ctx,
      planStyle: "easy",
    });
    expect(plan.feasible).toBe(true);
    if (!plan.feasible) throw new Error("expected feasible");
    const byId = ingredientsById();
    const day1 = plan.meals.find((m) => m.day === 1 && m.slot === "breakfast");
    const recipe = recipes.find((item) => item.id === day1?.recipeId);
    expect(recipe).toBeTruthy();
    if (!recipe || !day1) throw new Error("missing meal");
    expect(
      explainMealChoice(
        recipe,
        1,
        "breakfast",
        plan,
        "easy",
        [...SPEC_DEFAULT_BASKET],
        byId,
      ),
    ).toBe("省事：重复昨天这餐");
    const day0 = plan.meals.find((m) => m.day === 0 && m.slot === "breakfast");
    const first = recipes.find((item) => item.id === day0?.recipeId);
    expect(first).toBeTruthy();
    if (!first) throw new Error("missing day0");
    expect(
      explainMealChoice(
        first,
        0,
        "breakfast",
        plan,
        "easy",
        [...SPEC_DEFAULT_BASKET],
        byId,
      ),
    ).toMatch(/^用上/);
  });

  it("营养条 90–110% 含义不变，源码无 Math.random / maxRepeat", () => {
    const target = computeTarget(fullProfile);
    expect(inTargetBand(target.kcal, target.kcal)).toBe(true);
    expect(inTargetBand(target.kcal * 0.9, target.kcal)).toBe(true);
    expect(inTargetBand(target.kcal * 1.1, target.kcal)).toBe(true);
    expect(inTargetBand(target.kcal * 0.899, target.kcal)).toBe(false);
    expect(inTargetBand(target.kcal * 1.101, target.kcal)).toBe(false);
    expect(REPEAT_BAND).toBe(0.35);
    const src = readFileSync(path.join(here, "planner.ts"), "utf8");
    expect(src).not.toMatch(/Math\.random/);
    expect(src).not.toMatch(/maxRepeat/);
    expect(src).not.toMatch(/usedCount\s*\*\s*0\.35/);
  });
});

describe("universe + wanted A", () => {
  it("catalog T1 7 天 feasible（不断言 nutritionGate）", () => {
    const target = computeTarget(fullProfile);
    const universe = catalogIds();
    const plan = createMealPlan(recipes, target, 7, {
      profile: fullProfile,
      ingredients,
      universe,
    });
    expect(plan.feasible).toBe(true);
  });

  it("3 道可做 wanted 早餐 + easy + 7 天会轮换", () => {
    const target = computeTarget(fullProfile);
    const universe = catalogIds();
    const breakfasts = cookableRecipes(
      recipes,
      fullProfile,
      ingredients,
      universe,
    ).filter((recipe) => recipe.mealSlots.includes("breakfast"));
    expect(breakfasts.length).toBeGreaterThanOrEqual(3);
    const wantedRecipeIds = breakfasts.slice(0, 3).map((recipe) => recipe.id);
    const plan = createMealPlan(recipes, target, 7, {
      profile: fullProfile,
      ingredients,
      universe,
      planStyle: "easy",
      wantedRecipeIds,
    });
    expect(plan.feasible).toBe(true);
    if (!plan.feasible) throw new Error("expected feasible");
    const breakfastIds = plan.meals
      .filter((meal) => meal.slot === "breakfast")
      .map((meal) => meal.recipeId);
    const wantedSet = new Set(wantedRecipeIds);
    expect(breakfastIds.every((id) => wantedSet.has(id))).toBe(true);
    expect(new Set(breakfastIds).size).toBeGreaterThanOrEqual(2);
    for (const id of wantedRecipeIds) {
      expect(breakfastIds).toContain(id);
    }
    const lunchDinnerIds = plan.meals
      .filter((meal) => meal.slot !== "breakfast")
      .map((meal) => meal.recipeId);
    for (const id of wantedRecipeIds) {
      const recipe = recipes.find((row) => row.id === id);
      if (
        recipe &&
        !recipe.mealSlots.includes("lunch") &&
        !recipe.mealSlots.includes("dinner")
      ) {
        expect(lunchDinnerIds).not.toContain(id);
      }
    }
  });

  it("wantedChipBadge 无法做 / 未排上 / 排出前无徽章", () => {
    expect(wantedChipBadge("ghost", new Set(["a"]), null)).toBe("无法做");
    expect(wantedChipBadge("a", new Set(["a"]), null)).toBeNull();
    const plan: MealPlan = {
      days: 1,
      meals: [{ day: 0, slot: "breakfast", recipeId: "b" }],
      dailyActual: [{ kcal: 0, protein: 0, fat: 0, carb: 0 }],
      microAdjust: [],
      feasible: true,
    };
    expect(wantedChipBadge("a", new Set(["a"]), plan)).toBe("未排上");
    expect(wantedChipBadge("b", new Set(["b"]), plan)).toBeNull();
    expect(
      wantedChipBadge("a", new Set(["a"]), plan, ["breakfast"], ["lunch", "dinner"]),
    ).toBe("这顿不备");
  });
});

describe("enabledSlots + remaining gate", () => {
  it("breakfast 池空但 breakfast disabled → feasible", () => {
    const target = computeTarget(fullProfile);
    const noBreakfast = recipes.filter(
      (recipe) => !recipe.mealSlots.includes("breakfast"),
    );
    const profile: UserProfile = {
      ...fullProfile,
      enabledSlots: ["lunch", "dinner"],
      slotAbsences: { breakfast: { policy: "fold" } },
    };
    const plan = buildPlan(noBreakfast, target, 1, {
      profile,
      ingredients,
      universe: ALL_UNIVERSE,
    });
    expect(plan.feasible).toBe(true);
    if (!plan.feasible) throw new Error("expected feasible");
    expect(plan.meals.every((meal) => meal.slot !== "breakfast")).toBe(true);
  });

  it("applyMicroAdjust 午餐 reserve 后日热量不补到 2040", () => {
    const profile: UserProfile = {
      ...fullProfile,
      enabledSlots: ["breakfast", "dinner"],
      slotAbsences: { lunch: { policy: "reserve" } },
    };
    const full = computeTarget(profile);
    const remaining = remainingTarget(full, planSlotBudget(full, profile));
    expect(remaining.kcal).toBe(1224);
    const start = {
      kcal: 1000,
      protein: 70,
      fat: 30,
      carb: 100,
    };
    const adjusted = applyMicroAdjust(
      {
        days: 1,
        meals: [],
        dailyActual: [start],
        microAdjust: [],
        feasible: true,
      },
      full,
      {
        profile,
        ingredients,
        universe: new Set(["whey-protein", "banana", "wholewheat-bread"]),
      },
    );
    expect(adjusted.dailyActual[0].kcal).toBeGreaterThan(start.kcal);
    expect(adjusted.dailyActual[0].kcal).toBeLessThanOrEqual(
      remaining.kcal * 1.1 + 1e-6,
    );
  });

  it("scoreRecipe 四分母 safeDivisor，slotTarget 为 0 仍有限", () => {
    const recipe = recipes.find(
      (row) => row.id === "microwave-chicken-broccoli-box",
    );
    expect(recipe).toBeTruthy();
    if (!recipe) throw new Error("missing recipe");
    const score = scoreRecipe(
      recipe,
      { kcal: 0, protein: 0, fat: 0, carb: 0 },
      0,
      1,
      ingredientsById(),
    );
    expect(Number.isFinite(score)).toBe(true);
  });

  it("手搓 1 天 microwave-chicken-broccoli-box vs remaining 714/49 → gate.ok", () => {
    const profile: UserProfile = {
      ...fullProfile,
      enabledSlots: ["dinner"],
      slotAbsences: {
        breakfast: { policy: "fold" },
        lunch: { policy: "reserve" },
      },
    };
    const full = computeTarget(profile);
    const remaining = remainingTarget(full, planSlotBudget(full, profile));
    expect(remaining.kcal).toBe(714);
    expect(remaining.protein).toBe(49);
    const recipe = recipes.find(
      (row) => row.id === "microwave-chicken-broccoli-box",
    );
    expect(recipe).toBeTruthy();
    if (!recipe) throw new Error("missing microwave-chicken-broccoli-box");
    const macros = recipeMacros(recipe, ingredientsById());
    const plan: MealPlan = {
      days: 1,
      meals: [{ day: 0, slot: "dinner", recipeId: recipe.id }],
      dailyActual: [macros],
      microAdjust: [],
      feasible: true,
    };
    expect(nutritionGate(plan, remaining).ok).toBe(true);
  });

  it("createMealPlan T1 catalog 只备晚餐默认 C → feasible && gate.ok", () => {
    const profile: UserProfile = {
      ...fullProfile,
      enabledSlots: ["dinner"],
      slotAbsences: {
        breakfast: { policy: "fold" },
        lunch: { policy: "reserve" },
      },
    };
    const full = computeTarget(profile);
    const remaining = remainingTarget(full, planSlotBudget(full, profile));
    const plan = createMealPlan(recipes, full, 1, {
      profile,
      ingredients,
      universe: catalogIds(),
    });
    expect(plan.feasible).toBe(true);
    if (!plan.feasible) throw new Error("expected feasible");
    expect(nutritionGate(plan, remaining).ok).toBe(true);
  });

  it("createMealPlan T1 catalog 不吃早餐 1 天 → feasible && gate.ok", () => {
    const profile: UserProfile = {
      ...fullProfile,
      enabledSlots: ["lunch", "dinner"],
      slotAbsences: { breakfast: { policy: "fold" } },
    };
    const full = computeTarget(profile);
    const remaining = remainingTarget(full, planSlotBudget(full, profile));
    expect(remaining.kcal).toBe(2040);
    const plan = createMealPlan(recipes, full, 1, {
      profile,
      ingredients,
      universe: catalogIds(),
    });
    expect(plan.feasible).toBe(true);
    if (!plan.feasible) throw new Error("expected feasible");
    expect(plan.meals.every((meal) => meal.slot !== "breakfast")).toBe(true);
    expect(plan.meals).toHaveLength(2);
    expect(nutritionGate(plan, remaining).ok).toBe(true);
  });
});
