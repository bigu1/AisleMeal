import type {
  Ingredient,
  Macros,
  MealSlot,
  NutritionTarget,
  Recipe,
  SlotAbsence,
  SlotAbsencePolicy,
  UserProfile,
} from "./types";

export const ACTIVITY_FACTOR: Record<UserProfile["activity"], number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export const GOAL_FACTOR: Record<UserProfile["goal"], number> = {
  cut: 0.8,
  maintain: 1.0,
  bulk: 1.1,
};

export const PROTEIN_PER_KG: Record<UserProfile["goal"], number> = {
  cut: 2.0,
  bulk: 1.8,
  maintain: 1.4,
};

export const KCAL_FLOOR: Record<UserProfile["sex"], number> = {
  female: 1200,
  male: 1500,
};

export const SLOT_KCAL_RATIO: Record<MealSlot, number> = {
  breakfast: 0.25,
  lunch: 0.4,
  dinner: 0.35,
};

export const MEAL_SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner"];

export const DEFAULT_ABSENCE_POLICY: Record<MealSlot, SlotAbsencePolicy> = {
  breakfast: "fold",
  lunch: "reserve",
  dinner: "fold",
};

export function enabledSlotsOf(profile: UserProfile): MealSlot[] {
  const raw = profile.enabledSlots ?? [];
  const picked = MEAL_SLOTS.filter((slot) => raw.includes(slot));
  return picked.length > 0 ? picked : [...MEAL_SLOTS];
}

export function firstEnabledSlot(profile: UserProfile): MealSlot {
  return enabledSlotsOf(profile)[0];
}

/** Chip 文案用存储值；预算用这个。单槽时 fold 也当 reserve。 */
export function effectiveAbsencePolicy(
  profile: UserProfile,
  slot: MealSlot,
): SlotAbsencePolicy {
  const stored =
    profile.slotAbsences?.[slot]?.policy ?? DEFAULT_ABSENCE_POLICY[slot];
  if (enabledSlotsOf(profile).length === 1) return "reserve";
  return stored;
}

export function slotAbsencesOf(
  profile: UserProfile,
): Partial<Record<MealSlot, SlotAbsence>> {
  const enabled = new Set(enabledSlotsOf(profile));
  const out: Partial<Record<MealSlot, SlotAbsence>> = {};
  for (const slot of MEAL_SLOTS) {
    if (enabled.has(slot)) continue;
    out[slot] = profile.slotAbsences?.[slot] ?? {
      policy: DEFAULT_ABSENCE_POLICY[slot],
    };
  }
  return out;
}

export interface SlotPlanBudget {
  enabledSlots: MealSlot[];
  /** disabled 为 0；enabled 之和 = remaining.kcal / full.kcal（≥2 槽 fold 时 ≈ 1） */
  ratios: Record<MealSlot, number>;
  remaining: Macros;
  away: Macros;
}

function defaultAwayKcal(fullKcal: number, slot: MealSlot): number {
  return Math.round(fullKcal * SLOT_KCAL_RATIO[slot]);
}

function clampAway(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function planSlotBudget(
  full: NutritionTarget,
  profile: UserProfile,
): SlotPlanBudget {
  const enabled = enabledSlotsOf(profile);
  const enabledSet = new Set(enabled);
  const enabledSum = enabled.reduce((sum, slot) => sum + SLOT_KCAL_RATIO[slot], 0);
  const awayKcal: Record<MealSlot, number> = {
    breakfast: 0,
    lunch: 0,
    dinner: 0,
  };
  for (const slot of MEAL_SLOTS) {
    if (enabledSet.has(slot)) continue;
    const policy = effectiveAbsencePolicy(profile, slot);
    const defaultAway = defaultAwayKcal(full.kcal, slot);
    if (policy === "reserve") {
      const raw = profile.slotAbsences?.[slot]?.awayKcal;
      const missingOrZero =
        raw == null || !Number.isFinite(raw) || raw === 0;
      if (enabled.length === 1 && missingOrZero) {
        awayKcal[slot] = defaultAway;
      } else {
        const n =
          typeof raw === "number" && Number.isFinite(raw) ? raw : defaultAway;
        awayKcal[slot] = clampAway(n, 0, full.kcal);
      }
    } else {
      awayKcal[slot] = 0;
    }
  }
  const awayKcalTotal = MEAL_SLOTS.reduce((sum, slot) => sum + awayKcal[slot], 0);
  const remainingKcal = Math.max(0, full.kcal - awayKcalTotal);
  const scale = full.kcal > 0 ? remainingKcal / full.kcal : 0;
  const remaining: Macros = {
    kcal: remainingKcal,
    protein: full.protein * scale,
    fat: full.fat * scale,
    carb: full.carb * scale,
  };
  const ratios: Record<MealSlot, number> = {
    breakfast: 0,
    lunch: 0,
    dinner: 0,
  };
  for (const slot of enabled) {
    ratios[slot] = (SLOT_KCAL_RATIO[slot] / enabledSum) * scale;
  }
  return {
    enabledSlots: enabled,
    ratios,
    remaining,
    away: {
      kcal: full.kcal - remaining.kcal,
      protein: full.protein - remaining.protein,
      fat: full.fat - remaining.fat,
      carb: full.carb - remaining.carb,
    },
  };
}

/** 给 nutritionGate / 餐单 MacroBars。不对 remaining 再套 KCAL_FLOOR。 */
export function remainingTarget(
  full: NutritionTarget,
  budget: SlotPlanBudget,
): NutritionTarget {
  return {
    ...full,
    kcal: budget.remaining.kcal,
    protein: budget.remaining.protein,
    fat: budget.remaining.fat,
    carb: budget.remaining.carb,
    perMeal: {
      breakfast: full.kcal * budget.ratios.breakfast,
      lunch: full.kcal * budget.ratios.lunch,
      dinner: full.kcal * budget.ratios.dinner,
    },
  };
}

export function slotTargetsFromBudget(
  budget: SlotPlanBudget,
  full: NutritionTarget,
  slot: MealSlot,
): Macros {
  const r = budget.ratios[slot];
  return {
    kcal: full.kcal * r,
    protein: full.protein * r,
    fat: full.fat * r,
    carb: full.carb * r,
  };
}

export const KCAL_PER_KG = 7700;

export interface CutPlanValidation {
  errors: string[];
  warnings: string[];
}

export function validateCutPlanInputs(input: {
  weightKg: number;
  heightCm: number;
  targetWeightKg: number | null;
  targetWeeks: number | null;
}): CutPlanValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { weightKg, heightCm, targetWeightKg, targetWeeks } = input;

  if (
    targetWeightKg == null ||
    !Number.isFinite(targetWeightKg) ||
    targetWeightKg < 35 ||
    targetWeightKg > 200
  ) {
    errors.push("目标体重需在 35–200 kg");
  } else if (targetWeightKg >= weightKg) {
    errors.push("目标体重必须低于当前体重");
  }

  if (
    targetWeeks == null ||
    !Number.isFinite(targetWeeks) ||
    !Number.isInteger(targetWeeks) ||
    targetWeeks < 2 ||
    targetWeeks > 52
  ) {
    errors.push("计划周期需为 2–52 的整数周");
  }

  if (
    errors.length === 0 &&
    targetWeightKg != null &&
    targetWeeks != null
  ) {
    const weekly = (weightKg - targetWeightKg) / targetWeeks;
    if (weekly > 1.5) {
      errors.push("每周减重不宜超过 1.5kg，请降低目标或拉长周期");
    } else if (weekly > 1.0) {
      warnings.push("每周减重超过 1kg，请留意身体承受能力");
    }
    const heightM = heightCm / 100;
    const bmi = targetWeightKg / (heightM * heightM);
    if (bmi < 18.5) {
      warnings.push("目标体重偏低，结果仅供参考");
    }
  }

  return { errors, warnings };
}

export function hasValidCutTargets(profile: UserProfile): boolean {
  if (profile.goal !== "cut") return false;
  const result = validateCutPlanInputs({
    weightKg: profile.weightKg,
    heightCm: profile.heightCm,
    targetWeightKg: profile.targetWeightKg ?? null,
    targetWeeks: profile.targetWeeks ?? null,
  });
  return result.errors.length === 0;
}

export function bmr(profile: Pick<UserProfile, "sex" | "age" | "heightCm" | "weightKg">): number {
  const base = 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age;
  return profile.sex === "male" ? base + 5 : base - 161;
}

export function computeTarget(profile: UserProfile): NutritionTarget {
  const tdee = bmr(profile) * ACTIVITY_FACTOR[profile.activity];
  const useCutPlan = hasValidCutTargets(profile);
  let rawKcal: number;
  let dailyDeficit: number | undefined;
  let weeklyLossKg: number | undefined;
  if (useCutPlan && profile.targetWeightKg != null && profile.targetWeeks != null) {
    dailyDeficit =
      ((profile.weightKg - profile.targetWeightKg) * KCAL_PER_KG) /
      (profile.targetWeeks * 7);
    rawKcal = Math.round((tdee - dailyDeficit) / 10) * 10;
    weeklyLossKg = (profile.weightKg - profile.targetWeightKg) / profile.targetWeeks;
  } else {
    rawKcal = Math.round((tdee * GOAL_FACTOR[profile.goal]) / 10) * 10;
  }
  const floor = KCAL_FLOOR[profile.sex];
  const clampedToFloor = rawKcal < floor;
  const kcal = Math.max(rawKcal, floor);
  const protein = Math.round(PROTEIN_PER_KG[profile.goal] * profile.weightKg);
  let fat = Math.round(Math.max((0.25 * kcal) / 9, 0.8 * profile.weightKg));
  const carbEnergy = kcal - 4 * protein - 9 * fat;
  let carb = carbEnergy / 4;
  if (carb < 0) {
    carb = 0;
    fat = Math.round((kcal - 4 * protein) / 9);
  } else {
    carb = Math.round(carb);
  }
  return {
    kcal,
    protein,
    fat,
    carb,
    perMeal: {
      breakfast: kcal * SLOT_KCAL_RATIO.breakfast,
      lunch: kcal * SLOT_KCAL_RATIO.lunch,
      dinner: kcal * SLOT_KCAL_RATIO.dinner,
    },
    clampedToFloor,
    ...(useCutPlan
      ? { tdee, dailyDeficit, weeklyLossKg }
      : {}),
  };
}

export function emptyMacros(): Macros {
  return { kcal: 0, protein: 0, fat: 0, carb: 0 };
}

export function addMacros(a: Macros, b: Macros): Macros {
  return {
    kcal: a.kcal + b.kcal,
    protein: a.protein + b.protein,
    fat: a.fat + b.fat,
    carb: a.carb + b.carb,
  };
}

export function scaleMacros(m: Macros, grams: number): Macros {
  const f = grams / 100;
  return {
    kcal: m.kcal * f,
    protein: m.protein * f,
    fat: m.fat * f,
    carb: m.carb * f,
  };
}

export function recipeMacros(
  recipe: Recipe,
  byId: Map<string, Ingredient>,
): Macros {
  return recipe.ingredients.reduce((sum, item) => {
    const ingredient = byId.get(item.id);
    if (!ingredient) {
      throw new Error(`未知食材: ${item.id}（食谱 ${recipe.id}）`);
    }
    return addMacros(sum, scaleMacros(ingredient.per100g, item.grams));
  }, emptyMacros());
}

export function slotTargets(target: NutritionTarget, slot: MealSlot): Macros {
  const ratio = SLOT_KCAL_RATIO[slot];
  return {
    kcal: target.kcal * ratio,
    protein: target.protein * ratio,
    fat: target.fat * ratio,
    carb: target.carb * ratio,
  };
}

export const TARGET_BAND = { lo: 0.9, hi: 1.1 } as const;

export function inTargetBand(actual: number, target: number): boolean {
  const goal = target || 1;
  const ratio = actual / goal;
  return ratio >= TARGET_BAND.lo && ratio <= TARGET_BAND.hi;
}

export function bandSide(actual: number, target: number): "ok" | "low" | "high" {
  const goal = target || 1;
  const ratio = actual / goal;
  if (ratio < TARGET_BAND.lo) return "low";
  if (ratio > TARGET_BAND.hi) return "high";
  return "ok";
}

export type DisplayTone = "ok" | "warn" | "danger";

export function displayTone(actual: number, target: number): DisplayTone {
  if (inTargetBand(actual, target)) return "ok";
  const ratio = actual / (target || 1);
  if (ratio >= 0.75 && ratio <= 1.25) return "warn";
  return "danger";
}

export function roundMacros(m: Macros): Macros {
  return {
    kcal: Math.round(m.kcal),
    protein: Math.round(m.protein),
    fat: Math.round(m.fat),
    carb: Math.round(m.carb),
  };
}
