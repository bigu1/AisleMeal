export type Sex = "male" | "female";
export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "very_active";
export type Goal = "cut" | "bulk" | "maintain";
export type Equipment = "ricecooker" | "airfryer" | "microwave" | "stove";
export type Category = "protein" | "carb" | "veg" | "fat" | "seasoning";
export type MealSlot = "breakfast" | "lunch" | "dinner";
export type SlotAbsencePolicy = "fold" | "reserve";

export interface SlotAbsence {
  policy: SlotAbsencePolicy;
  /** 仅 policy=reserve；缺省 = round(dailyKcal * SLOT_KCAL_RATIO[slot]) */
  awayKcal?: number;
}
export type PlanStyle = "easy" | "variety";
export type ScopeMode = "catalog" | "basket";
export type AvailabilitySourceId = "user-shelf";
export type Allergen =
  | "egg"
  | "milk"
  | "peanut"
  | "tree_nut"
  | "soy"
  | "gluten"
  | "fish"
  | "shellfish";

export interface Macros {
  kcal: number;
  protein: number;
  fat: number;
  carb: number;
}

export interface Ingredient {
  id: string;
  name: string;
  category: Category;
  per100g: Macros & { fiber?: number };
  pack: { size: number; unit: "g" | "ml" | "个"; label: string };
  storage: { fridgeDays: number; freezable: boolean };
  microAdjust?: boolean;
  allergens?: Allergen[];
  source: string;
  /** 分类内越小越常见 */
  popularity: number;
}

export interface CustomIngredient {
  id: string;
  name: string;
  category: Category;
  pack: Ingredient["pack"];
  per100g: Macros & { fiber?: number };
  allergens?: Allergen[];
  /** 有则参与排菜，等同该内置 id */
  similarToId?: string;
}

export interface RecipeIngredient {
  id: string;
  grams: number;
}

export interface Recipe {
  id: string;
  name: string;
  mealSlots: MealSlot[];
  equipment: Equipment[];
  timeMinutes: number;
  difficulty: 1 | 2;
  ingredients: RecipeIngredient[];
  steps: string[];
  tags: string[];
}

export interface UserProfile {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activity: ActivityLevel;
  goal: Goal;
  equipment: Equipment[];
  allergens: Allergen[];
  excludedIngredientIds: string[];
  /** 仅 goal=cut 时有意义；旧档案可缺 */
  targetWeightKg?: number;
  targetWeeks?: number;
  /** 缺省或空 = 三餐全备（0.3 行为） */
  enabledSlots?: MealSlot[];
  /** 只允许出现未备的槽；备上的槽必须删掉 */
  slotAbsences?: Partial<Record<MealSlot, SlotAbsence>>;
}

export interface NutritionTarget extends Macros {
  perMeal: Record<MealSlot, number>;
  clampedToFloor: boolean;
  /** 仅减脂新公式：未取整 TDEE */
  tdee?: number;
  /** 仅减脂新公式：每日缺口 kcal */
  dailyDeficit?: number;
  /** 仅减脂新公式：每周减重 kg */
  weeklyLossKg?: number;
}

export interface PantryItem {
  ingredientId: string;
  grams: number;
}

export interface PlannedMeal {
  day: number;
  slot: MealSlot;
  recipeId: string;
}

export interface MicroAdjustSuggestion {
  day: number;
  ingredientId: string;
  grams: number;
  reason: string;
}

export interface MealPlan {
  days: number;
  meals: PlannedMeal[];
  dailyActual: Macros[];
  microAdjust: MicroAdjustSuggestion[];
  feasible: true;
}

export interface InfeasiblePlan {
  feasible: false;
  reason: "no_recipes_for_slot" | "not_enough_variety";
  blockedSlots: MealSlot[];
  suggestions: { ingredientId: string; unlocksRecipes: number }[];
}

export interface ShoppingLine {
  ingredientId: string;
  needGrams: number;
  packs: number;
  packGrams: number;
  surplusGrams: number;
  storageHint?: string;
}

export type ShoppingListStatus = "active" | "archived";

export interface ShoppingListItem {
  ingredientId: string;
  needGrams: number;
  packs: number;
  packGrams: number;
  surplusGrams: number;
  storageHint?: string;
  checked: boolean;
}

export interface NamedShoppingList {
  id: string;
  name: string;
  status: ShoppingListStatus;
  stale: boolean;
  createdAt: string;
  updatedAt: string;
  sourceId: AvailabilitySourceId;
  days: number;
  planStartedOn: string | null;
  linkedMeals: PlannedMeal[];
  linkedMicroAdjust: MicroAdjustSuggestion[];
  items: ShoppingListItem[];
}

export interface ListUndo {
  lists: NamedShoppingList[];
  activeId: string | null;
  expiresAt: number;
}

export interface BasketFeedback {
  cookableCount: number;
  bySlot: Record<MealSlot, number>;
  planPreview: MealPlan | InfeasiblePlan;
  hint?: string;
}

export interface BasketUndo {
  ids: string[];
  planStyle: PlanStyle;
  days: number;
}

export interface PlanDiversity {
  unique: number;
  repeatMeals: number;
  uniqueIds: string[];
}

export interface ShoppingListGrouped {
  protein: ShoppingLine[];
  carb: ShoppingLine[];
  veg: ShoppingLine[];
  fat: ShoppingLine[];
  seasoning: ShoppingLine[];
}

