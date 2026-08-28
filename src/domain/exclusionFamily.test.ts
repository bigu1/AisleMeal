import { describe, expect, it } from "vitest";
import { catalogIds } from "./availability";
import { ingredients, recipes } from "./data";
import {
  CHICKEN_MEAT_IDS,
  effectiveExcludedIds,
  toggleExclusionFamily,
} from "./exclusionFamily";
import { computeTarget } from "./nutrition";
import { createMealPlan, recipeAllowedByProfile } from "./planner";
import type { UserProfile } from "./types";

const base: UserProfile = {
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

describe("effectiveExcludedIds", () => {
  it("勾鸡胸展开腿和爪，不含鸡精", () => {
    const ids = effectiveExcludedIds(["chicken-breast"]);
    expect(ids).toEqual(expect.arrayContaining([...CHICKEN_MEAT_IDS]));
    expect(ids).not.toContain("chicken-essence");
  });

  it("勾鸡爪同样展开整组", () => {
    const ids = effectiveExcludedIds(["chicken-feet"]);
    expect(new Set(ids)).toEqual(new Set(CHICKEN_MEAT_IDS));
  });

  it("蛋没有品类展开", () => {
    expect(effectiveExcludedIds(["egg"])).toEqual(["egg"]);
  });
});

describe("toggleExclusionFamily", () => {
  it("点鸡胸写入胸腿爪；再点关掉整组", () => {
    const on = toggleExclusionFamily([], "chicken-breast");
    expect(new Set(on)).toEqual(new Set(CHICKEN_MEAT_IDS));
    expect(toggleExclusionFamily(on, "chicken-thigh")).toEqual([]);
  });

  it("旧档案只存了鸡胸，点一下会关掉整组而不是再勾上", () => {
    expect(toggleExclusionFamily(["chicken-breast"], "chicken-breast")).toEqual(
      [],
    );
  });
});

describe("recipeAllowedByProfile chicken family", () => {
  const noBreast: UserProfile = {
    ...base,
    excludedIngredientIds: ["chicken-breast"],
  };

  it("只排除鸡胸时鸡腿餐和鸡爪饭都不可做", () => {
    const thigh = recipes.find((row) => row.id === "airfryer-chicken-thigh-corn");
    const feet = recipes.find((row) => row.id === "chicken-feet-rice");
    const tofu = recipes.find((row) => row.id === "box-firm-brown-broccoli-0");
    expect(thigh && feet && tofu).toBeTruthy();
    expect(recipeAllowedByProfile(thigh!, noBreast, ingredients)).toBe(false);
    expect(recipeAllowedByProfile(feet!, noBreast, ingredients)).toBe(false);
    expect(recipeAllowedByProfile(tofu!, noBreast, ingredients)).toBe(true);
  });
});

describe("createMealPlan chicken family", () => {
  it("catalog 3 天排除鸡胸则餐单用料不含胸腿爪", () => {
    const profile: UserProfile = {
      ...base,
      excludedIngredientIds: ["chicken-breast"],
    };
    const planned = createMealPlan(recipes, computeTarget(profile), 3, {
      profile,
      ingredients,
      universe: catalogIds(),
    });
    expect(planned.feasible).toBe(true);
    if (!planned.feasible) throw new Error("expected feasible");
    const meat = new Set<string>(CHICKEN_MEAT_IDS);
    for (const meal of planned.meals) {
      const recipe = recipes.find((row) => row.id === meal.recipeId);
      expect(recipe).toBeTruthy();
      for (const row of recipe!.ingredients) {
        expect(meat.has(row.id), `${meal.recipeId} uses ${row.id}`).toBe(false);
      }
    }
  });
});
