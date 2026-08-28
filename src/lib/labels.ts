import type { ActivityLevel, Allergen, Category, Equipment, Goal, MealSlot, Sex } from "@/domain/types";

export const SEX_LABEL: Record<Sex, string> = {
  male: "男",
  female: "女",
};

export const ACTIVITY_LABEL: Record<ActivityLevel, string> = {
  sedentary: "久坐",
  light: "轻度活动",
  moderate: "中度活动",
  active: "高强度",
  very_active: "极高",
};

export const ACTIVITY_HINT: Record<ActivityLevel, string> = {
  sedentary: "几乎不运动，办公室久坐",
  light: "每周散步或轻松运动 1–3 次",
  moderate: "每周中等运动 3–5 次",
  active: "每周大量运动 6–7 次",
  very_active: "体力劳动或一天两练",
};

export const GOAL_LABEL: Record<Goal, string> = {
  cut: "减脂",
  bulk: "增肌",
  maintain: "维持",
};

export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  ricecooker: "电饭煲",
  airfryer: "空气炸锅",
  microwave: "微波炉",
  stove: "燃气灶",
};

export const ALLERGEN_LABEL: Record<Allergen, string> = {
  egg: "蛋",
  milk: "奶",
  peanut: "花生",
  tree_nut: "坚果",
  soy: "大豆",
  gluten: "麸质",
  fish: "鱼",
  shellfish: "虾蟹贝",
};

export const CATEGORY_LABEL: Record<Category, string> = {
  protein: "蛋白源",
  carb: "碳水源",
  veg: "蔬菜",
  fat: "脂肪源",
  seasoning: "调味品",
};

export const SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: "早餐",
  lunch: "午餐",
  dinner: "晚餐",
};

export const SLOT_PREP_LABEL: Record<MealSlot, string> = {
  breakfast: "备早餐",
  lunch: "备午餐",
  dinner: "备晚餐",
};

export const ONBOARD_STEPS = [
  "身体",
  "目标",
  "过敏与不吃",
  "厨具",
  "估算结果",
] as const;

export const PLAN_STYLE_LABEL = {
  easy: "省事",
  variety: "换花样",
} as const;
