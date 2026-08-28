import { describe, expect, it } from "vitest";
import { ingredients } from "./data";
import { buildShoppingList, isBulkyPack, storageHintFor } from "./shoppingList";
import type { MealPlan, Recipe } from "./types";

const chicken = ingredients.find((i) => i.id === "chicken-breast")!;
const tofu = ingredients.find((i) => i.id === "firm-tofu")!;

const recipe: Recipe = {
  id: "test-chicken",
  name: "测试鸡胸",
  mealSlots: ["lunch"],
  equipment: [],
  timeMinutes: 10,
  difficulty: 1,
  ingredients: [{ id: "chicken-breast", grams: 750 }],
  steps: ["做"],
  tags: [],
};

const tofuRecipe: Recipe = {
  id: "test-tofu",
  name: "测试豆腐",
  mealSlots: ["dinner"],
  equipment: [],
  timeMinutes: 10,
  difficulty: 1,
  ingredients: [{ id: "firm-tofu", grams: 200 }],
  steps: ["做"],
  tags: [],
};

const basePlan = (recipeId: string, days: number): MealPlan => ({
  days,
  meals: [{ day: 0, slot: "lunch", recipeId }],
  dailyActual: [{ kcal: 0, protein: 0, fat: 0, carb: 0 }],
  microAdjust: [],
  feasible: true,
});

describe("buildShoppingList", () => {
  it("扣存货、包装取整、富余计算", () => {
    const grouped = buildShoppingList(
      basePlan("test-chicken", 3),
      [{ ingredientId: "chicken-breast", grams: 300 }],
      ingredients,
      [recipe],
      3,
    );
    expect(grouped.protein).toHaveLength(1);
    const line = grouped.protein[0];
    const size = chicken.pack.size;
    expect(line.needGrams).toBe(450);
    expect(line.packs).toBe(Math.ceil(450 / size));
    expect(line.packGrams).toBe(line.packs * size);
    expect(line.surplusGrams).toBe(line.packGrams - 450);
  });

  it("无存货时鸡胸按包装取整", () => {
    const grouped = buildShoppingList(
      basePlan("test-chicken", 3),
      [],
      ingredients,
      [recipe],
      3,
    );
    const line = grouped.protein[0];
    const size = chicken.pack.size;
    expect(line.needGrams).toBe(750);
    expect(line.packs).toBe(Math.ceil(750 / size));
    expect(line.packGrams).toBe(line.packs * size);
    expect(line.surplusGrams).toBe(line.packGrams - 750);
  });

  it("storageHint: 可冷冻", () => {
    expect(storageHintFor(chicken, 3)).toBe("买回当天分装冷冻");
    const grouped = buildShoppingList(
      basePlan("test-chicken", 3),
      [],
      ingredients,
      [recipe],
      3,
    );
    expect(grouped.protein[0].storageHint).toBe("买回当天分装冷冻");
  });

  it("storageHint: 不可冷冻且保质期短于天数", () => {
    expect(storageHintFor(tofu, 5)).toBe("第 3 天前吃完");
    const grouped = buildShoppingList(
      basePlan("test-tofu", 5),
      [],
      ingredients,
      [tofuRecipe],
      5,
    );
    expect(grouped.veg.length + grouped.protein.length).toBeGreaterThan(0);
    const line = [...grouped.protein, ...grouped.veg].find(
      (l) => l.ingredientId === "firm-tofu",
    );
    expect(line?.storageHint).toBe("第 3 天前吃完");
  });

  it("纯牛奶按盒买，不是整箱", () => {
    const milk = ingredients.find((item) => item.id === "whole-milk");
    expect(milk).toBeTruthy();
    expect(milk!.pack.size).toBe(250);
    expect(milk!.pack.label).toBe("盒");
    const milkRecipe: Recipe = {
      id: "test-milk",
      name: "测试牛奶",
      mealSlots: ["breakfast"],
      equipment: [],
      timeMinutes: 1,
      difficulty: 1,
      ingredients: [{ id: "whole-milk", grams: 250 }],
      steps: ["倒"],
      tags: [],
    };
    const grouped = buildShoppingList(
      {
        days: 1,
        meals: [{ day: 0, slot: "breakfast", recipeId: "test-milk" }],
        dailyActual: [{ kcal: 0, protein: 0, fat: 0, carb: 0 }],
        microAdjust: [],
        feasible: true,
      },
      [],
      ingredients,
      [milkRecipe],
      3,
    );
    const line = grouped.protein.find((row) => row.ingredientId === "whole-milk");
    expect(line).toBeTruthy();
    expect(line!.needGrams).toBe(250);
    expect(line!.packs).toBe(1);
    expect(line!.packGrams).toBe(250);
    expect(line!.packs * milk!.pack.size).not.toBe(3200);
  });

  it("大米 5kg / 坚果大包装相对小用量算 bulky", () => {
    const rice = ingredients.find((item) => item.id === "white-rice");
    const nuts = ingredients.find((item) => item.id === "mixed-nuts");
    expect(rice?.pack.size).toBe(5000);
    expect(nuts?.pack.size).toBe(200);
    const riceRecipe: Recipe = {
      id: "test-rice",
      name: "测试米",
      mealSlots: ["lunch"],
      equipment: [],
      timeMinutes: 1,
      difficulty: 1,
      ingredients: [{ id: "white-rice", grams: 300 }],
      steps: ["煮"],
      tags: [],
    };
    const grouped = buildShoppingList(
      {
        days: 1,
        meals: [{ day: 0, slot: "lunch", recipeId: "test-rice" }],
        dailyActual: [{ kcal: 0, protein: 0, fat: 0, carb: 0 }],
        microAdjust: [],
        feasible: true,
      },
      [],
      ingredients,
      [riceRecipe],
      3,
    );
    const line = grouped.carb.find((row) => row.ingredientId === "white-rice");
    expect(line).toBeTruthy();
    expect(isBulkyPack(line!)).toBe(true);
    expect(
      isBulkyPack({
        needGrams: 45,
        packGrams: 450,
        surplusGrams: 405,
      }),
    ).toBe(true);
    expect(
      isBulkyPack({
        needGrams: 250,
        packGrams: 400,
        surplusGrams: 150,
      }),
    ).toBe(false);
  });
});
