import { bandSide } from "./nutrition";
import type { MealPlan, NutritionTarget } from "./types";

export interface NutritionGate {
  ok: boolean;
  failingDays: number[];
  reasons: string[];
}

function formatDays(days: number[]): string {
  return days.map((day) => String(day + 1)).join("、");
}

export function nutritionGate(
  plan: MealPlan,
  target: NutritionTarget,
): NutritionGate {
  const failingDays: number[] = [];
  const kcalLow: number[] = [];
  const kcalHigh: number[] = [];
  const proteinLow: number[] = [];
  const proteinHigh: number[] = [];

  for (let day = 0; day < plan.days; day += 1) {
    const actual = plan.dailyActual[day] ?? {
      kcal: 0,
      protein: 0,
      fat: 0,
      carb: 0,
    };
    const kcal = bandSide(actual.kcal, target.kcal);
    const protein = bandSide(actual.protein, target.protein);
    let fail = false;
    if (kcal === "low") {
      kcalLow.push(day);
      fail = true;
    } else if (kcal === "high") {
      kcalHigh.push(day);
      fail = true;
    }
    if (protein === "low") {
      proteinLow.push(day);
      fail = true;
    } else if (protein === "high") {
      proteinHigh.push(day);
      fail = true;
    }
    if (fail) failingDays.push(day);
  }

  const reasons: string[] = [];
  if (kcalLow.length > 0) reasons.push(`第 ${formatDays(kcalLow)} 天热量偏低`);
  if (kcalHigh.length > 0) reasons.push(`第 ${formatDays(kcalHigh)} 天热量偏高`);
  if (proteinLow.length > 0) {
    reasons.push(`第 ${formatDays(proteinLow)} 天蛋白偏低`);
  }
  if (proteinHigh.length > 0) {
    reasons.push(`第 ${formatDays(proteinHigh)} 天蛋白偏高`);
  }

  return {
    ok: reasons.length === 0,
    failingDays,
    reasons,
  };
}
