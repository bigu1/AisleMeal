import { describe, expect, it } from "vitest";
import { computeTarget, planSlotBudget, remainingTarget } from "./nutrition";
import { nutritionGate } from "./nutritionGate";
import type { MealPlan, UserProfile } from "./types";

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

function planWith(daily: MealPlan["dailyActual"]): MealPlan {
  return {
    days: daily.length,
    meals: [],
    dailyActual: daily,
    microAdjust: [],
    feasible: true,
  };
}

describe("nutritionGate", () => {
  const target = computeTarget(T1);

  it("蛋白 80% 失败且 reasons 1-based 偏低", () => {
    const gate = nutritionGate(
      planWith([
        {
          kcal: target.kcal,
          protein: target.protein * 0.8,
          fat: target.fat,
          carb: target.carb,
        },
      ]),
      target,
    );
    expect(gate.ok).toBe(false);
    expect(gate.failingDays).toEqual([0]);
    expect(gate.reasons.some((reason) => reason.includes("偏低"))).toBe(true);
    expect(gate.reasons.join("；")).toMatch(/第 1 天蛋白偏低/);
  });

  it("仅脂肪 66% 仍通过（脂肪不进门闩）", () => {
    const gate = nutritionGate(
      planWith([
        {
          kcal: target.kcal,
          protein: target.protein,
          fat: target.fat * 0.66,
          carb: target.carb,
        },
      ]),
      target,
    );
    expect(gate.ok).toBe(true);
    expect(gate.failingDays).toEqual([]);
    expect(gate.reasons).toEqual([]);
  });

  it("热量 120% 失败且 reasons 1-based 偏高", () => {
    const gate = nutritionGate(
      planWith([
        {
          kcal: target.kcal * 1.2,
          protein: target.protein,
          fat: target.fat,
          carb: target.carb,
        },
      ]),
      target,
    );
    expect(gate.ok).toBe(false);
    expect(gate.failingDays).toEqual([0]);
    expect(gate.reasons.join("；")).toMatch(/第 1 天热量偏高/);
  });

  it("门闩卡在目标 90–110% 边界", () => {
    const okLo = planWith([
      {
        kcal: target.kcal * 0.9,
        protein: target.protein * 0.9,
        fat: target.fat,
        carb: target.carb,
      },
    ]);
    const okHi = planWith([
      {
        kcal: target.kcal * 1.1,
        protein: target.protein * 1.1,
        fat: target.fat,
        carb: target.carb,
      },
    ]);
    const low = planWith([
      {
        kcal: target.kcal * 0.899,
        protein: target.protein,
        fat: target.fat,
        carb: target.carb,
      },
    ]);
    const high = planWith([
      {
        kcal: target.kcal * 1.101,
        protein: target.protein,
        fat: target.fat,
        carb: target.carb,
      },
    ]);
    expect(nutritionGate(okLo, target).ok).toBe(true);
    expect(nutritionGate(okHi, target).ok).toBe(true);
    expect(nutritionGate(low, target).ok).toBe(false);
    expect(nutritionGate(high, target).ok).toBe(false);
  });

  it("同一 side+宏量的天合并进一条", () => {
    const okDay = {
      kcal: target.kcal,
      protein: target.protein,
      fat: target.fat,
      carb: target.carb,
    };
    const highKcal = {
      ...okDay,
      kcal: target.kcal * 1.2,
    };
    const gate = nutritionGate(planWith([okDay, highKcal, okDay, okDay, highKcal]), target);
    expect(gate.ok).toBe(false);
    expect(gate.failingDays).toEqual([1, 4]);
    expect(gate.reasons).toEqual(["第 2、5 天热量偏高"]);
  });

  it("remaining=1224 对准 1224 → ok，对准 2040 → 偏高", () => {
    const lunchAway: UserProfile = {
      ...T1,
      enabledSlots: ["breakfast", "dinner"],
      slotAbsences: { lunch: { policy: "reserve" } },
    };
    const full = computeTarget(lunchAway);
    const remaining = remainingTarget(full, planSlotBudget(full, lunchAway));
    expect(remaining.kcal).toBe(1224);
    const aligned = planWith([
      {
        kcal: remaining.kcal,
        protein: remaining.protein,
        fat: remaining.fat,
        carb: remaining.carb,
      },
    ]);
    const toFull = planWith([
      {
        kcal: full.kcal,
        protein: remaining.protein,
        fat: remaining.fat,
        carb: remaining.carb,
      },
    ]);
    expect(nutritionGate(aligned, remaining).ok).toBe(true);
    const high = nutritionGate(toFull, remaining);
    expect(high.ok).toBe(false);
    expect(high.reasons.join("；")).toMatch(/热量偏高/);
  });

  it("仅脂肪 66% 对 remaining 仍 ok", () => {
    const remaining = remainingTarget(
      target,
      planSlotBudget(target, {
        ...T1,
        enabledSlots: ["breakfast", "dinner"],
        slotAbsences: { lunch: { policy: "reserve" } },
      }),
    );
    const gate = nutritionGate(
      planWith([
        {
          kcal: remaining.kcal,
          protein: remaining.protein,
          fat: remaining.fat * 0.66,
          carb: remaining.carb,
        },
      ]),
      remaining,
    );
    expect(gate.ok).toBe(true);
  });
});
