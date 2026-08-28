import { describe, expect, it } from "vitest";
import { catalogIds } from "./availability";
import { sanitizeBasket } from "./basketSanitize";
import { ingredients } from "./data";
import { recipeAllowedByProfile } from "./planner";
import { recipes } from "./data";
import type { UserProfile } from "./types";

const catalog = catalogIds();

const ROLE3: UserProfile = {
  sex: "female",
  age: 30,
  heightCm: 165,
  weightKg: 58,
  activity: "light",
  goal: "maintain",
  equipment: ["ricecooker", "airfryer", "microwave", "stove"],
  allergens: ["egg", "milk"],
  excludedIngredientIds: ["chicken-breast"],
};

const DIRTY_DEFAULT = [
  "chicken-breast",
  "egg",
  "brown-rice",
  "oats",
  "broccoli",
  "tomato",
  "banana",
  "greek-yogurt",
  "olive-oil",
  "whole-milk",
];

describe("sanitizeBasket", () => {
  it("角色 3 蛋+奶+不吃鸡胸：已选不含蛋/酸奶/鸡胸/燕麦", () => {
    expect(DIRTY_DEFAULT).toEqual(
      expect.arrayContaining(["egg", "greek-yogurt", "chicken-breast", "oats"]),
    );
    const egg = ingredients.find((item) => item.id === "egg");
    const yogurt = ingredients.find((item) => item.id === "greek-yogurt");
    expect(egg?.allergens).toContain("egg");
    expect(yogurt?.allergens).toContain("milk");
    expect(catalog.has("oats")).toBe(true);
    expect(catalog.has("greek-yogurt")).toBe(true);

    const cleaned = sanitizeBasket(DIRTY_DEFAULT, ROLE3, ingredients, catalog);
    expect(cleaned).not.toContain("egg");
    expect(cleaned).not.toContain("greek-yogurt");
    expect(cleaned).not.toContain("chicken-breast");
    expect(cleaned).toContain("oats");
    expect(cleaned).not.toContain("whole-milk");
    expect(cleaned).toEqual(
      expect.arrayContaining(["brown-rice", "broccoli", "tomato", "banana", "olive-oil"]),
    );
  });

  it("排除鸡胸时洗掉鸡腿鸡爪", () => {
    const cleaned = sanitizeBasket(
      ["chicken-breast", "chicken-thigh", "chicken-feet", "broccoli"],
      ROLE3,
      ingredients,
      catalog,
    );
    expect(cleaned).not.toContain("chicken-breast");
    expect(cleaned).not.toContain("chicken-thigh");
    expect(cleaned).not.toContain("chicken-feet");
    expect(cleaned).toContain("broccoli");
  });

  it("无过敏档案保留燕麦酸奶等常见货", () => {
    const plain: UserProfile = { ...ROLE3, allergens: [], excludedIngredientIds: [] };
    const cleaned = sanitizeBasket(DIRTY_DEFAULT, plain, ingredients, catalog);
    expect(cleaned).toContain("oats");
    expect(cleaned).toContain("greek-yogurt");
    expect(cleaned).toContain("egg");
    expect(cleaned).toContain("chicken-breast");
  });
});

describe("wonton egg allergen", () => {
  it("蛋过敏时 wonton-breakfast 不可做", () => {
    const wonton = ingredients.find((item) => item.id === "wonton");
    const recipe = recipes.find((item) => item.id === "wonton-breakfast");
    expect(wonton?.allergens).toEqual(expect.arrayContaining(["gluten", "egg"]));
    expect(recipe).toBeTruthy();
    expect(recipeAllowedByProfile(recipe!, ROLE3, ingredients)).toBe(false);
    expect(
      recipeAllowedByProfile(
        recipe!,
        { ...ROLE3, allergens: [], excludedIngredientIds: [] },
        ingredients,
      ),
    ).toBe(true);
  });
});
