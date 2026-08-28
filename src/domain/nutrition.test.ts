import { describe, expect, it } from "vitest";
import {
  computeTarget,
  displayTone,
  inTargetBand,
  planSlotBudget,
  remainingTarget,
  SLOT_KCAL_RATIO,
  validateCutPlanInputs,
} from "./nutrition";
import type { UserProfile } from "./types";

function profile(partial: Partial<UserProfile> & Pick<
  UserProfile,
  "sex" | "age" | "heightCm" | "weightKg" | "activity" | "goal"
>): UserProfile {
  return {
    equipment: ["ricecooker", "airfryer", "microwave", "stove"],
    allergens: [],
    excludedIngredientIds: [],
    ...partial,
  };
}

describe("computeTarget", () => {
  it("T1 male 30/175/70 moderate cut", () => {
    const t = computeTarget(
      profile({
        sex: "male",
        age: 30,
        heightCm: 175,
        weightKg: 70,
        activity: "moderate",
        goal: "cut",
      }),
    );
    expect(t.kcal).toBe(2040);
    expect(t.protein).toBe(140);
    expect(t.fat).toBe(57);
    expect(t.carb).toBe(242);
    expect(t.clampedToFloor).toBe(false);
  });

  it("T2 female 28/162/55 light cut", () => {
    const t = computeTarget(
      profile({
        sex: "female",
        age: 28,
        heightCm: 162,
        weightKg: 55,
        activity: "light",
        goal: "cut",
      }),
    );
    expect(t.kcal).toBe(1390);
    expect(t.protein).toBe(110);
    expect(t.fat).toBe(44);
    expect(t.carb).toBe(139);
    expect(t.clampedToFloor).toBe(false);
  });

  it("T3 male 25/180/75 sedentary maintain", () => {
    const t = computeTarget(
      profile({
        sex: "male",
        age: 25,
        heightCm: 180,
        weightKg: 75,
        activity: "sedentary",
        goal: "maintain",
      }),
    );
    expect(t.kcal).toBe(2110);
    expect(t.protein).toBe(105);
    expect(t.fat).toBe(60);
    expect(t.carb).toBe(288);
    expect(t.clampedToFloor).toBe(false);
  });

  it("安全下限 female 45/150/40 sedentary cut", () => {
    const t = computeTarget(
      profile({
        sex: "female",
        age: 45,
        heightCm: 150,
        weightKg: 40,
        activity: "sedentary",
        goal: "cut",
      }),
    );
    expect(t.kcal).toBe(1200);
    expect(t.clampedToFloor).toBe(true);
  });

  it("C1 male 30/175/70 moderate cut 65kg/10周", () => {
    const t = computeTarget(
      profile({
        sex: "male",
        age: 30,
        heightCm: 175,
        weightKg: 70,
        activity: "moderate",
        goal: "cut",
        targetWeightKg: 65,
        targetWeeks: 10,
      }),
    );
    expect(t.kcal).toBe(2010);
    expect(t.protein).toBe(140);
    expect(t.fat).toBe(56);
    expect(t.carb).toBe(237);
    expect(t.clampedToFloor).toBe(false);
    expect(t.tdee).toBeCloseTo(2555.5625, 6);
    expect(t.dailyDeficit).toBe(550);
    expect(t.weeklyLossKg).toBe(0.5);
  });

  it("减脂但缺目标字段仍等于旧 T1", () => {
    const t = computeTarget(
      profile({
        sex: "male",
        age: 30,
        heightCm: 175,
        weightKg: 70,
        activity: "moderate",
        goal: "cut",
      }),
    );
    expect(t.kcal).toBe(2040);
    expect(t.protein).toBe(140);
    expect(t.fat).toBe(57);
    expect(t.carb).toBe(242);
    expect(t.tdee).toBeUndefined();
  });

  it("增肌/维持不读目标字段，T3 不变", () => {
    const t = computeTarget(
      profile({
        sex: "male",
        age: 25,
        heightCm: 180,
        weightKg: 75,
        activity: "sedentary",
        goal: "maintain",
        targetWeightKg: 60,
        targetWeeks: 8,
      }),
    );
    expect(t.kcal).toBe(2110);
    expect(t.protein).toBe(105);
    expect(t.fat).toBe(60);
    expect(t.carb).toBe(288);
    expect(t.tdee).toBeUndefined();
  });

  it("每周减重 >1.5kg 表单层拦住；领域层回退 ×0.80", () => {
    const form = validateCutPlanInputs({
      weightKg: 70,
      heightCm: 175,
      targetWeightKg: 50,
      targetWeeks: 10,
    });
    expect(form.errors).toContain("每周减重不宜超过 1.5kg，请降低目标或拉长周期");

    const t = computeTarget(
      profile({
        sex: "male",
        age: 30,
        heightCm: 175,
        weightKg: 70,
        activity: "moderate",
        goal: "cut",
        targetWeightKg: 50,
        targetWeeks: 10,
      }),
    );
    expect(t.kcal).toBe(2040);
    expect(t.protein).toBe(140);
    expect(t.fat).toBe(57);
    expect(t.carb).toBe(242);
  });
});

describe("inTargetBand", () => {
  it("90–110% 为真，之外为假", () => {
    expect(inTargetBand(90, 100)).toBe(true);
    expect(inTargetBand(110, 100)).toBe(true);
    expect(inTargetBand(80, 100)).toBe(false);
    expect(inTargetBand(120, 100)).toBe(false);
  });
});

describe("planSlotBudget / remainingTarget", () => {
  const t1 = profile({
    sex: "male",
    age: 30,
    heightCm: 175,
    weightKg: 70,
    activity: "moderate",
    goal: "cut",
  });
  const full = computeTarget(t1);

  it("computeTarget 不读餐位，T1 字段仍是 2040/140/57/242", () => {
    const dinnerOnly = computeTarget({
      ...t1,
      enabledSlots: ["dinner"],
      slotAbsences: {
        breakfast: { policy: "fold" },
        lunch: { policy: "reserve" },
      },
    });
    expect(dinnerOnly.kcal).toBe(2040);
    expect(dinnerOnly.protein).toBe(140);
    expect(dinnerOnly.fat).toBe(57);
    expect(dinnerOnly.carb).toBe(242);
    expect(dinnerOnly).toEqual(full);
  });

  it("三槽全开 remaining = full", () => {
    const budget = planSlotBudget(full, t1);
    const remaining = remainingTarget(full, budget);
    expect(remaining.kcal).toBe(2040);
    expect(remaining.protein).toBe(140);
    expect(remaining.fat).toBe(57);
    expect(remaining.carb).toBe(242);
    expect(budget.ratios.breakfast).toBeCloseTo(SLOT_KCAL_RATIO.breakfast);
    expect(budget.ratios.lunch).toBeCloseTo(SLOT_KCAL_RATIO.lunch);
    expect(budget.ratios.dinner).toBeCloseTo(SLOT_KCAL_RATIO.dinner);
  });

  it("不吃早餐仍备午+晚 remaining.kcal=2040，午 0.40/0.75、晚 0.35/0.75", () => {
    const p: UserProfile = {
      ...t1,
      enabledSlots: ["lunch", "dinner"],
      slotAbsences: { breakfast: { policy: "fold" } },
    };
    const budget = planSlotBudget(full, p);
    const remaining = remainingTarget(full, budget);
    expect(remaining.kcal).toBe(2040);
    expect(remaining.protein).toBe(140);
    expect(budget.ratios.breakfast).toBe(0);
    expect(budget.ratios.lunch).toBeCloseTo(0.4 / 0.75);
    expect(budget.ratios.dinner).toBeCloseTo(0.35 / 0.75);
    expect(full.kcal * budget.ratios.lunch).toBeCloseTo(1088);
    expect(full.kcal * budget.ratios.dinner).toBeCloseTo(952);
  });

  it("午餐在外仍备早+晚 remaining.kcal=1224，protein=140×1224/2040，不对 remaining 套 KCAL_FLOOR", () => {
    const p: UserProfile = {
      ...t1,
      enabledSlots: ["breakfast", "dinner"],
      slotAbsences: { lunch: { policy: "reserve" } },
    };
    const remaining = remainingTarget(full, planSlotBudget(full, p));
    expect(remaining.kcal).toBe(1224);
    expect(remaining.protein).toBeCloseTo((140 * 1224) / 2040);
    expect(remaining.kcal).not.toBe(1500);
    expect(remaining.kcal).toBeLessThan(1500);
  });

  it("只备晚餐默认 C remaining.kcal=714 protein=49", () => {
    const p: UserProfile = {
      ...t1,
      enabledSlots: ["dinner"],
      slotAbsences: {
        breakfast: { policy: "fold" },
        lunch: { policy: "reserve" },
      },
    };
    const remaining = remainingTarget(full, planSlotBudget(full, p));
    expect(remaining.kcal).toBe(714);
    expect(remaining.protein).toBe(49);
  });

  it("单槽存储 fold 或 breakfast awayKcal=0 仍 remaining=714，不得变 1224", () => {
    const storedFold: UserProfile = {
      ...t1,
      enabledSlots: ["dinner"],
      slotAbsences: {
        breakfast: { policy: "fold" },
        lunch: { policy: "reserve" },
      },
    };
    const awayZero: UserProfile = {
      ...t1,
      enabledSlots: ["dinner"],
      slotAbsences: {
        breakfast: { policy: "reserve", awayKcal: 0 },
        lunch: { policy: "reserve" },
      },
    };
    expect(remainingTarget(full, planSlotBudget(full, storedFold)).kcal).toBe(714);
    expect(remainingTarget(full, planSlotBudget(full, awayZero)).kcal).toBe(714);
    expect(remainingTarget(full, planSlotBudget(full, storedFold)).kcal).not.toBe(
      1224,
    );
  });
});

describe("displayTone", () => {
  it("ok 当且仅当 inTargetBand（含 0.90 / 1.10）", () => {
    expect(displayTone(90, 100)).toBe("ok");
    expect(displayTone(110, 100)).toBe("ok");
    expect(displayTone(100, 100)).toBe("ok");
    expect(inTargetBand(90, 100)).toBe(true);
    expect(displayTone(89.9, 100)).not.toBe("ok");
    expect(displayTone(110.1, 100)).not.toBe("ok");
  });

  it("0.899 / 1.101 与 0.75 / 1.25 为 warn；0.749 / 1.251 为 danger", () => {
    expect(displayTone(89.9, 100)).toBe("warn");
    expect(displayTone(110.1, 100)).toBe("warn");
    expect(displayTone(75, 100)).toBe("warn");
    expect(displayTone(125, 100)).toBe("warn");
    expect(displayTone(74.9, 100)).toBe("danger");
    expect(displayTone(125.1, 100)).toBe("danger");
  });

  it("42/64 脂肪与 239/191 碳水为 danger", () => {
    expect(displayTone(42, 64)).toBe("danger");
    expect(displayTone(239, 191)).toBe("danger");
  });
});
