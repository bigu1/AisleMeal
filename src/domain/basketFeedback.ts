import { createMealPlan, eligibleRecipes } from "./planner";
import { computeTarget, enabledSlotsOf } from "./nutrition";
import type {
  BasketFeedback,
  Ingredient,
  MealSlot,
  PlanStyle,
  Recipe,
  UserProfile,
} from "./types";

const SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: "早餐",
  lunch: "午餐",
  dinner: "晚餐",
};

export function computeBasketFeedback(
  basketIds: string[],
  profile: UserProfile,
  days: number,
  recipes: Recipe[],
  ingredients: Ingredient[],
  planStyle: PlanStyle = "easy",
): BasketFeedback {
  const eligible = eligibleRecipes(recipes, profile, basketIds, ingredients);
  const bySlot: Record<MealSlot, number> = {
    breakfast: eligible.filter((r) => r.mealSlots.includes("breakfast")).length,
    lunch: eligible.filter((r) => r.mealSlots.includes("lunch")).length,
    dinner: eligible.filter((r) => r.mealSlots.includes("dinner")).length,
  };
  const target = computeTarget(profile);
  const planPreview = createMealPlan(recipes, target, days, {
    profile,
    ingredients,
    universe: new Set(basketIds),
    planStyle,
  });

  const equipmentOnly = eligibleRecipes(recipes, profile, undefined, ingredients);
  const equipmentBySlot: Record<MealSlot, number> = {
    breakfast: equipmentOnly.filter((r) => r.mealSlots.includes("breakfast")).length,
    lunch: equipmentOnly.filter((r) => r.mealSlots.includes("lunch")).length,
    dinner: equipmentOnly.filter((r) => r.mealSlots.includes("dinner")).length,
  };
  const emptyEquipmentSlots = enabledSlotsOf(profile).filter(
    (slot) => equipmentBySlot[slot] === 0,
  );

  let hint: string | undefined;
  if (!planPreview.feasible) {
    if (emptyEquipmentSlots.length > 0) {
      const slots = emptyEquipmentSlots.map((s) => SLOT_LABEL[s]).join("、");
      hint = `当前厨具做不出${slots}，请回建档勾选电饭煲/空气炸锅/微波炉/燃气灶`;
    } else {
      const names = planPreview.suggestions
        .map((s) => ingredients.find((i) => i.id === s.ingredientId)?.name)
        .filter((name): name is string => Boolean(name))
        .slice(0, 3);
      const useful = planPreview.suggestions.filter((s) => s.unlocksRecipes > 0);
      if (names.length > 0 && useful.length > 0) {
        hint = `还差 ${planPreview.blockedSlots.length} 餐位没菜可做，建议添加：${names.join("、")}`;
      } else {
        hint = `还差 ${planPreview.blockedSlots.length} 餐位没菜可做`;
      }
    }
  }

  return {
    cookableCount: eligible.length,
    bySlot,
    planPreview,
    hint,
  };
}
