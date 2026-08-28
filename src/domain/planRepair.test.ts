import { describe, expect, it } from "vitest";
import { catalogIds } from "./availability";
import { ingredients, recipes } from "./data";
import {
  computeTarget,
  planSlotBudget,
  remainingTarget,
} from "./nutrition";
import { nutritionGate } from "./nutritionGate";
import { repairPlanToGate } from "./planRepair";
import { createMealPlan, type PlanContext } from "./planner";
import type { MealPlan, Recipe, UserProfile } from "./types";

const ALL_EQ: UserProfile["equipment"] = [
  "ricecooker",
  "airfryer",
  "microwave",
  "stove",
];

const ROLE1: UserProfile = {
  sex: "female",
  age: 28,
  heightCm: 162,
  weightKg: 55,
  activity: "light",
  goal: "cut",
  equipment: ALL_EQ,
  allergens: [],
  excludedIngredientIds: [],
  targetWeightKg: 52,
  targetWeeks: 12,
};

const ROLE2: UserProfile = {
  sex: "male",
  age: 25,
  heightCm: 180,
  weightKg: 75,
  activity: "sedentary",
  goal: "maintain",
  equipment: ALL_EQ,
  allergens: [],
  excludedIngredientIds: [],
};

const DEFAULT_NINE = [
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

function remainingFor(profile: UserProfile) {
  const full = computeTarget(profile);
  return { full, remaining: remainingTarget(full, planSlotBudget(full, profile)) };
}

function ctxOf(profile: UserProfile, universe: Set<string>, style: "easy" | "variety" = "easy"): PlanContext {
  return { profile, ingredients, universe, planStyle: style };
}

describe("repairPlanToGate", () => {
  it("角色 1 减脂女 catalog 3 天 repair 后门闩过", () => {
    const { full, remaining } = remainingFor(ROLE1);
    const universe = catalogIds();
    const ctx = ctxOf(ROLE1, universe, "easy");
    const planned = createMealPlan(recipes, full, 3, ctx);
    expect(planned.feasible).toBe(true);
    if (!planned.feasible) throw new Error("expected feasible");
    const repaired = repairPlanToGate(planned, recipes, full, ctx);
    expect(repaired.ok).toBe(true);
    expect(nutritionGate(repaired.plan, remaining).ok).toBe(true);
    const stuffing = repaired.plan.meals.some((meal) => {
      const recipe = recipes.find((row) => row.id === meal.recipeId);
      return recipe?.ingredients.some((row) => row.id === "chicken-feet");
    });
    expect(stuffing).toBe(false);
  });

  it("角色 2 默认 9 样 easy 3 天：记录 repair 是否过门闩", () => {
    const { full, remaining } = remainingFor(ROLE2);
    const basketCtx = ctxOf(ROLE2, new Set(DEFAULT_NINE), "easy");
    const planned = createMealPlan(recipes, full, 3, basketCtx);
    expect(planned.feasible).toBe(true);
    if (!planned.feasible) throw new Error("expected feasible");
    const repaired = repairPlanToGate(planned, recipes, full, basketCtx);
    expect(nutritionGate(repaired.plan, remaining).ok).toBe(repaired.ok);
    if (repaired.ok) {
      expect(repaired.plan.meals.some((meal) => meal.recipeId === "chicken-feet-rice")).toBe(
        false,
      );
    }
  });

  it("角色 2 店内目录换花样 3 天过门闩", () => {
    const { full, remaining } = remainingFor(ROLE2);
    const catalogCtx = ctxOf(ROLE2, catalogIds(), "variety");
    const variety = createMealPlan(recipes, full, 3, catalogCtx);
    expect(variety.feasible).toBe(true);
    if (!variety.feasible) throw new Error("expected catalog variety feasible");
    expect(nutritionGate(variety, remaining).ok).toBe(true);
  });

  it("蛋白缺口时不塞鸡爪", () => {
    const feet = recipes.find((row) => row.id === "chicken-feet-rice");
    const tofu = recipes.find((row) => row.id === "box-firm-brown-broccoli-0");
    expect(feet && tofu).toBeTruthy();
    expect(feet!.ingredients.some((row) => row.id === "chicken-feet")).toBe(
      true,
    );
    const low: MealPlan = {
      feasible: true,
      days: 1,
      meals: [{ day: 0, slot: "lunch", recipeId: tofu!.id }],
      dailyActual: [{ kcal: 200, protein: 8, fat: 5, carb: 30 }],
      microAdjust: [],
    };
    const pool: Recipe[] = [tofu!, feet!];
    const ctx: PlanContext = {
      profile: ROLE1,
      ingredients,
      universe: new Set(
        pool.flatMap((recipe) => recipe.ingredients.map((row) => row.id)),
      ),
    };
    const { full } = remainingFor(ROLE1);
    const repaired = repairPlanToGate(low, pool, full, ctx);
    expect(pool.some((recipe) => recipe.id === "chicken-feet-rice")).toBe(true);
    expect(
      repaired.plan.meals.some((meal) => meal.recipeId === "chicken-feet-rice"),
    ).toBe(false);
  });
});
