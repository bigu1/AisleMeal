import { describe, expect, it } from "vitest";
import { computeBasketFeedback } from "./basketFeedback";
import { ingredients, recipes } from "./data";
import { computeTarget } from "./nutrition";
import { createMealPlan } from "./planner";
import type { Recipe, UserProfile } from "./types";

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

const allIds = ingredients.map((item) => item.id);

function t1(equipment: UserProfile["equipment"]): UserProfile {
  return {
    sex: "male",
    age: 30,
    heightCm: 175,
    weightKg: 70,
    activity: "moderate",
    goal: "cut",
    equipment,
    allergens: [],
    excludedIngredientIds: [],
  };
}

const fullEq: UserProfile["equipment"] = [
  "ricecooker",
  "airfryer",
  "microwave",
  "stove",
];

describe("computeBasketFeedback", () => {
  it("厨具空 + 全食材 + 3 天：不可行，hint 谈厨具", () => {
    const fb = computeBasketFeedback(allIds, t1([]), 3, recipes, ingredients);
    expect(fb.planPreview.feasible).toBe(false);
    expect(fb.hint).toMatch(/厨具|电饭煲|空气炸锅|微波炉|燃气灶/);
    expect(fb.hint).not.toMatch(/主食或蛋白/);
  });

  it("全厨具 + 全食材 + 7 天：可行", () => {
    const fb = computeBasketFeedback(allIds, t1(fullEq), 7, recipes, ingredients);
    expect(fb.planPreview.feasible).toBe(true);
  });

  it("默认 9 样 + T1 全厨具 + 3 天：可行", () => {
    const fb = computeBasketFeedback(
      [...SPEC_DEFAULT_BASKET],
      t1(fullEq),
      3,
      recipes,
      ingredients,
    );
    expect(fb.planPreview.feasible).toBe(true);
  });

  it("只选微波炉 + 默认 9 样 + 7 天：可行，或 hint 不叫减少天数", () => {
    const fb = computeBasketFeedback(
      [...SPEC_DEFAULT_BASKET],
      t1(["microwave"]),
      7,
      recipes,
      ingredients,
    );
    if (!fb.planPreview.feasible) {
      expect(fb.hint ?? "").not.toMatch(/减少天数/);
    } else {
      expect(fb.planPreview.feasible).toBe(true);
    }
  });

  it("默认 9 样 + 全厨具：1 天可行则 7 天也可行", () => {
    const one = computeBasketFeedback(
      [...SPEC_DEFAULT_BASKET],
      t1(fullEq),
      1,
      recipes,
      ingredients,
    );
    const seven = computeBasketFeedback(
      [...SPEC_DEFAULT_BASKET],
      t1(fullEq),
      7,
      recipes,
      ingredients,
    );
    expect(one.planPreview.feasible).toBe(true);
    expect(seven.planPreview.feasible).toBe(true);
  });

  it("传入 variety 时试排跟 planStyle 走", () => {
    const easy = computeBasketFeedback(
      [...SPEC_DEFAULT_BASKET],
      t1(fullEq),
      7,
      recipes,
      ingredients,
      "easy",
    );
    const variety = computeBasketFeedback(
      [...SPEC_DEFAULT_BASKET],
      t1(fullEq),
      7,
      recipes,
      ingredients,
      "variety",
    );
    expect(easy.planPreview.feasible).toBe(true);
    expect(variety.planPreview.feasible).toBe(true);
    if (!easy.planPreview.feasible || !variety.planPreview.feasible) {
      throw new Error("expected feasible");
    }
    const target = computeTarget(t1(fullEq));
    const easyPlan = createMealPlan(recipes, target, 7, {
      profile: t1(fullEq),
      ingredients,
      universe: new Set(SPEC_DEFAULT_BASKET),
      planStyle: "easy",
    });
    const varietyPlan = createMealPlan(recipes, target, 7, {
      profile: t1(fullEq),
      ingredients,
      universe: new Set(SPEC_DEFAULT_BASKET),
      planStyle: "variety",
    });
    if (!easyPlan.feasible || !varietyPlan.feasible) {
      throw new Error("expected feasible");
    }
    expect(easy.planPreview.meals).toEqual(easyPlan.meals);
    expect(variety.planPreview.meals).toEqual(varietyPlan.meals);
  });

  it("disabled 槽空池 hint 不提该槽", () => {
    const dinnerOnly: Recipe = {
      id: "hint-dinner-only",
      name: "hint-dinner-only",
      mealSlots: ["dinner"],
      equipment: ["microwave"],
      timeMinutes: 5,
      difficulty: 1,
      ingredients: [{ id: "egg", grams: 50 }],
      steps: ["x"],
      tags: [],
    };
    const profile: UserProfile = {
      ...t1(["microwave"]),
      enabledSlots: ["lunch"],
      slotAbsences: {
        breakfast: { policy: "fold" },
        dinner: { policy: "fold" },
      },
    };
    const fb = computeBasketFeedback(
      allIds,
      profile,
      1,
      [dinnerOnly],
      ingredients,
    );
    expect(fb.planPreview.feasible).toBe(false);
    expect(fb.hint ?? "").toMatch(/午餐|厨具/);
    expect(fb.hint ?? "").not.toMatch(/早餐/);
  });
});
