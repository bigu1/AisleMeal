import { allIngredientIds } from "@/domain/availability";
import { isBasketIdBlocked, sanitizeBasket } from "@/domain/basketSanitize";
import { ingredients, recipes } from "@/domain/data";
import {
  addMacros,
  computeTarget,
  emptyMacros,
  MEAL_SLOTS,
  recipeMacros,
  scaleMacros,
  SLOT_KCAL_RATIO,
} from "@/domain/nutrition";
import { buildShoppingList, flattenShoppingList } from "@/domain/shoppingList";
import type {
  Allergen,
  AvailabilitySourceId,
  BasketUndo,
  Category,
  CustomIngredient,
  InfeasiblePlan,
  Macros,
  MealPlan,
  MealSlot,
  MicroAdjustSuggestion,
  NamedShoppingList,
  PantryItem,
  PlannedMeal,
  PlanStyle,
  ScopeMode,
  ShoppingListItem,
  SlotAbsence,
  UserProfile,
} from "@/domain/types";
import { commonKitchenIds } from "@/domain/shelf";
import { localYmd } from "@/lib/planDay";

export const PERSIST_FIELD_KEYS = [
  "profile",
  "pantry",
  "basketIds",
  "days",
  "plan",
  "progressStep",
  "planStyle",
  "basketUndo",
  "planStartedOn",
  "scopeMode",
  "wantedRecipeIds",
  "shoppingLists",
  "activeShoppingListId",
  "customIngredients",
] as const;

export interface PersistSnapshot {
  profile?: UserProfile | null;
  pantry?: PantryItem[];
  plan?: MealPlan | InfeasiblePlan | null;
  basketIds?: string[];
  days?: number;
  shoppingChecked?: Record<string, boolean>;
  progressStep?: number;
  planStyle?: PlanStyle;
  basketUndo?: BasketUndo | null;
  planStartedOn?: string | null;
  scopeMode?: ScopeMode;
  wantedRecipeIds?: string[];
  shoppingLists?: NamedShoppingList[];
  activeShoppingListId?: string | null;
  customIngredients?: CustomIngredient[];
}

const CATEGORY_SET = new Set(["protein", "carb", "veg", "fat", "seasoning"]);

export function coerceCustomIngredients(value: unknown): CustomIngredient[] {
  if (!Array.isArray(value)) return [];
  const out: CustomIngredient[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const raw = row as Record<string, unknown>;
    if (typeof raw.id !== "string" || !raw.id.startsWith("user-")) continue;
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (name.length === 0) continue;
    if (typeof raw.category !== "string" || !CATEGORY_SET.has(raw.category)) {
      continue;
    }
    const packRaw =
      raw.pack && typeof raw.pack === "object"
        ? (raw.pack as Record<string, unknown>)
        : null;
    const size = packRaw ? asFiniteNumber(packRaw.size) : null;
    if (size == null || size <= 0) continue;
    if (
      packRaw?.unit !== "g" &&
      packRaw?.unit !== "ml" &&
      packRaw?.unit !== "个"
    ) {
      continue;
    }
    const label =
      typeof packRaw.label === "string" && packRaw.label.trim()
        ? packRaw.label.trim()
        : "份";
    const macros = coerceMacros(raw.per100g);
    if (!macros) continue;
    const item: CustomIngredient = {
      id: raw.id,
      name: name.slice(0, 40),
      category: raw.category as Category,
      pack: { size, unit: packRaw.unit, label: label.slice(0, 20) },
      per100g: macros,
    };
    if (Array.isArray(raw.allergens)) {
      const allergens = raw.allergens.filter(
        (a): a is Allergen => typeof a === "string" && ALLERGEN_SET.has(a),
      );
      if (allergens.length > 0) item.allergens = allergens;
    }
    if (
      typeof raw.similarToId === "string" &&
      KNOWN_INGREDIENT_IDS.has(raw.similarToId)
    ) {
      item.similarToId = raw.similarToId;
    }
    out.push(item);
    if (out.length >= 40) break;
  }
  return out;
}

export function coercePlanStyle(value: unknown): PlanStyle {
  return value === "variety" ? "variety" : "easy";
}

export function coerceScopeMode(value: unknown): ScopeMode {
  return value === "basket" ? "basket" : "catalog";
}

export function clampDays(value: unknown, fallback = 3): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(7, Math.max(1, n));
}

export function coercePlanStartedOn(
  value: unknown,
  plan: MealPlan | InfeasiblePlan | null | undefined,
): string | null {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  if (plan && plan.feasible === true) return localYmd();
  return null;
}

export function coerceBasketUndo(value: unknown): BasketUndo | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { ids?: unknown; planStyle?: unknown; days?: unknown };
  if (!Array.isArray(raw.ids)) return null;
  return {
    ids: raw.ids.filter((id): id is string => typeof id === "string"),
    planStyle: coercePlanStyle(raw.planStyle),
    days: clampDays(raw.days),
  };
}

const MEAL_SLOT_SET = new Set(["breakfast", "lunch", "dinner"]);
const SEX_SET = new Set(["male", "female"]);
const ACTIVITY_SET = new Set([
  "sedentary",
  "light",
  "moderate",
  "active",
  "very_active",
]);
const GOAL_SET = new Set(["cut", "bulk", "maintain"]);
const EQUIPMENT_SET = new Set(["ricecooker", "airfryer", "microwave", "stove"]);
const ALLERGEN_SET = new Set([
  "egg",
  "milk",
  "peanut",
  "tree_nut",
  "soy",
  "gluten",
  "fish",
  "shellfish",
]);
const KNOWN_INGREDIENT_IDS = new Set(ingredients.map((item) => item.id));
const KNOWN_RECIPE_IDS = new Set(recipes.map((recipe) => recipe.id));
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function clampInt(value: unknown, lo: number, hi: number): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < lo || rounded > hi) return Math.min(hi, Math.max(lo, rounded));
  return rounded;
}

function clampGrams(value: unknown): number | null {
  const n = asFiniteNumber(value);
  if (n == null || n <= 0) return null;
  return Math.min(99999, n);
}

export function coerceMeals(
  value: unknown,
  days: number,
): PlannedMeal[] {
  if (!Array.isArray(value)) return [];
  const out: PlannedMeal[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const raw = row as Record<string, unknown>;
    const day = typeof raw.day === "number" && Number.isInteger(raw.day) ? raw.day : null;
    if (day == null || day < 0 || day >= days) continue;
    if (typeof raw.slot !== "string" || !MEAL_SLOT_SET.has(raw.slot)) continue;
    if (typeof raw.recipeId !== "string" || raw.recipeId.length === 0) continue;
    if (!KNOWN_RECIPE_IDS.has(raw.recipeId)) continue;
    out.push({
      day,
      slot: raw.slot as PlannedMeal["slot"],
      recipeId: raw.recipeId,
    });
  }
  return out;
}

export function coerceMicroAdjust(
  value: unknown,
  days: number,
): MicroAdjustSuggestion[] {
  if (!Array.isArray(value)) return [];
  const out: MicroAdjustSuggestion[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const raw = row as Record<string, unknown>;
    const day = typeof raw.day === "number" && Number.isInteger(raw.day) ? raw.day : null;
    if (day == null || day < 0 || day >= days) continue;
    if (typeof raw.ingredientId !== "string" || raw.ingredientId.length === 0) {
      continue;
    }
    const grams = clampGrams(raw.grams);
    if (grams == null) continue;
    out.push({
      day,
      ingredientId: raw.ingredientId,
      grams,
      reason: typeof raw.reason === "string" ? raw.reason : "",
    });
  }
  return out;
}

function clampQty(value: unknown): number | null {
  const n = asFiniteNumber(value);
  if (n == null || n < 0) return null;
  return Math.min(99999, n);
}

function coerceMacros(value: unknown): Macros | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const kcal = clampQty(raw.kcal);
  const protein = clampQty(raw.protein);
  const fat = clampQty(raw.fat);
  const carb = clampQty(raw.carb);
  if (kcal == null || protein == null || fat == null || carb == null) {
    return null;
  }
  return { kcal, protein, fat, carb };
}

function actualFromMeals(
  meals: PlannedMeal[],
  days: number,
  extras: MicroAdjustSuggestion[],
): Macros[] {
  const byId = new Map(ingredients.map((item) => [item.id, item]));
  const recipeMap = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const daily = Array.from({ length: days }, () => emptyMacros());
  for (const meal of meals) {
    const recipe = recipeMap.get(meal.recipeId);
    if (!recipe) continue;
    daily[meal.day] = addMacros(daily[meal.day], recipeMacros(recipe, byId));
  }
  for (const extra of extras) {
    const ingredient = byId.get(extra.ingredientId);
    if (!ingredient) continue;
    daily[extra.day] = addMacros(
      daily[extra.day],
      scaleMacros(ingredient.per100g, extra.grams),
    );
  }
  return daily;
}

export function coerceDailyActual(value: unknown, days: number): Macros[] {
  const rows = Array.isArray(value) ? value : [];
  return Array.from({ length: days }, (_, i) => {
    return (
      coerceMacros(rows[i]) ?? { kcal: 0, protein: 0, fat: 0, carb: 0 }
    );
  });
}

export function coercePlan(
  value: unknown,
): MealPlan | InfeasiblePlan | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.feasible === false) {
    return {
      feasible: false,
      reason:
        raw.reason === "not_enough_variety"
          ? "not_enough_variety"
          : "no_recipes_for_slot",
      blockedSlots: Array.isArray(raw.blockedSlots)
        ? (raw.blockedSlots as InfeasiblePlan["blockedSlots"]).filter(
            (slot) => typeof slot === "string" && MEAL_SLOT_SET.has(slot),
          )
        : [],
      suggestions: Array.isArray(raw.suggestions)
        ? (raw.suggestions as InfeasiblePlan["suggestions"])
        : [],
    };
  }
  if (raw.feasible !== true) return null;
  if (!Array.isArray(raw.meals)) return null;
  const days = clampDays(raw.days);
  const hadUnknownRecipe = raw.meals.some((row) => {
    if (!row || typeof row !== "object") return false;
    const recipeId = (row as Record<string, unknown>).recipeId;
    return typeof recipeId === "string" && recipeId.length > 0 && !KNOWN_RECIPE_IDS.has(recipeId);
  });
  if (hadUnknownRecipe) return null;
  const meals = coerceMeals(raw.meals, days);
  if (meals.length === 0) return null;
  const microAdjust = coerceMicroAdjust(raw.microAdjust, days);
  return {
    feasible: true,
    days,
    meals,
    dailyActual: actualFromMeals(meals, days, microAdjust),
    microAdjust,
  };
}

export function coerceProfile(value: unknown): UserProfile | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.sex !== "string" || !SEX_SET.has(raw.sex)) return null;
  if (typeof raw.activity !== "string" || !ACTIVITY_SET.has(raw.activity)) {
    return null;
  }
  if (typeof raw.goal !== "string" || !GOAL_SET.has(raw.goal)) return null;
  const age = clampInt(raw.age, 14, 80);
  const heightCm = clampInt(raw.heightCm, 130, 220);
  const weightKg = clampInt(raw.weightKg, 35, 200);
  if (age == null || heightCm == null || weightKg == null) return null;
  const equipment = Array.isArray(raw.equipment)
    ? raw.equipment.filter(
        (eq): eq is UserProfile["equipment"][number] =>
          typeof eq === "string" && EQUIPMENT_SET.has(eq),
      )
    : [];
  const allergens = Array.isArray(raw.allergens)
    ? raw.allergens.filter(
        (a): a is UserProfile["allergens"][number] =>
          typeof a === "string" && ALLERGEN_SET.has(a),
      )
    : [];
  const excludedIngredientIds = Array.isArray(raw.excludedIngredientIds)
    ? raw.excludedIngredientIds.filter(
        (id): id is string =>
          typeof id === "string" &&
          !DANGEROUS_KEYS.has(id) &&
          KNOWN_INGREDIENT_IDS.has(id),
      )
    : [];
  const profile: UserProfile = {
    sex: raw.sex as UserProfile["sex"],
    age,
    heightCm,
    weightKg,
    activity: raw.activity as UserProfile["activity"],
    goal: raw.goal as UserProfile["goal"],
    equipment,
    allergens,
    excludedIngredientIds,
    enabledSlots: coerceEnabledSlots(raw.enabledSlots),
  };
  if (profile.goal === "cut") {
    const tw = clampInt(raw.targetWeightKg, 35, 200);
    const weeks = clampInt(raw.targetWeeks, 2, 52);
    if (tw != null) profile.targetWeightKg = tw;
    if (weeks != null) profile.targetWeeks = weeks;
  }
  let fullKcal: number | null = null;
  try {
    fullKcal = computeTarget(profile).kcal;
  } catch {
    fullKcal = null;
  }
  const absences = coerceSlotAbsences(
    raw.slotAbsences,
    profile.enabledSlots ?? [...MEAL_SLOTS],
    fullKcal,
  );
  if (absences) profile.slotAbsences = absences;
  return profile;
}

function coerceEnabledSlots(value: unknown): MealSlot[] {
  if (!Array.isArray(value)) return [...MEAL_SLOTS];
  const picked = MEAL_SLOTS.filter((slot) => value.includes(slot));
  return picked.length > 0 ? picked : [...MEAL_SLOTS];
}

function coerceSlotAbsences(
  value: unknown,
  enabled: MealSlot[],
  fullKcal: number | null,
): UserProfile["slotAbsences"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const enabledSet = new Set(enabled);
  const out: NonNullable<UserProfile["slotAbsences"]> = {};
  const hi = fullKcal ?? 9999;
  for (const slot of MEAL_SLOTS) {
    if (enabledSet.has(slot)) continue;
    if (DANGEROUS_KEYS.has(slot)) continue;
    const row = raw[slot];
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const rec = row as Record<string, unknown>;
    if (rec.policy !== "fold" && rec.policy !== "reserve") continue;
    const absence: SlotAbsence = { policy: rec.policy };
    if (rec.policy === "reserve") {
      const n =
        typeof rec.awayKcal === "number" && Number.isFinite(rec.awayKcal)
          ? Math.round(rec.awayKcal)
          : null;
      if (enabled.length === 1) {
        const share =
          fullKcal != null ? Math.round(fullKcal * SLOT_KCAL_RATIO[slot]) : null;
        const rawAway = n == null || n === 0 ? share : n;
        if (rawAway != null) {
          absence.awayKcal = Math.min(hi, Math.max(1, rawAway));
        }
      } else if (n != null) {
        absence.awayKcal = Math.min(hi, Math.max(0, n));
      }
    }
    out[slot] = absence;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function coercePantry(value: unknown): PantryItem[] {
  if (!Array.isArray(value)) return [];
  const out: PantryItem[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const raw = row as Record<string, unknown>;
    if (typeof raw.ingredientId !== "string") continue;
    if (DANGEROUS_KEYS.has(raw.ingredientId)) continue;
    if (!KNOWN_INGREDIENT_IDS.has(raw.ingredientId)) continue;
    const grams = clampGrams(raw.grams);
    if (grams == null) continue;
    out.push({ ingredientId: raw.ingredientId, grams });
  }
  return out;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function coerceShoppingListItem(value: unknown): ShoppingListItem | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.ingredientId !== "string" || raw.ingredientId.length === 0) {
    return null;
  }
  if (DANGEROUS_KEYS.has(raw.ingredientId)) return null;
  if (!KNOWN_INGREDIENT_IDS.has(raw.ingredientId)) return null;
  const needGrams = clampQty(raw.needGrams);
  const packs = clampQty(raw.packs);
  const packGrams = clampQty(raw.packGrams);
  const surplusGrams = clampQty(raw.surplusGrams);
  if (
    needGrams == null ||
    packs == null ||
    packGrams == null ||
    surplusGrams == null
  ) {
    return null;
  }
  const item: ShoppingListItem = {
    ingredientId: raw.ingredientId,
    needGrams,
    packs,
    packGrams,
    surplusGrams,
    checked: raw.checked === true,
  };
  if (typeof raw.storageHint === "string") item.storageHint = raw.storageHint;
  return item;
}

function coerceIso(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function coerceOneNamedList(value: unknown): NamedShoppingList | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== "string" || raw.id.length === 0) return null;
  const items = Array.isArray(raw.items)
    ? raw.items
        .map(coerceShoppingListItem)
        .filter((item): item is ShoppingListItem => item != null)
    : [];
  const sourceId: AvailabilitySourceId = "user-shelf";
  const planStartedOn =
    typeof raw.planStartedOn === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(raw.planStartedOn)
      ? raw.planStartedOn
      : null;
  return {
    id: raw.id,
    name: truncateListName(
      typeof raw.name === "string" && raw.name.trim() ? raw.name : "清单",
    ),
    status: raw.status === "active" ? "active" : "archived",
    stale: raw.stale === true,
    createdAt: coerceIso(raw.createdAt, ""),
    updatedAt: coerceIso(raw.updatedAt, coerceIso(raw.createdAt, "")),
    sourceId,
    days: clampDays(raw.days),
    planStartedOn,
    linkedMeals: coerceMeals(raw.linkedMeals, clampDays(raw.days)),
    linkedMicroAdjust: coerceMicroAdjust(
      raw.linkedMicroAdjust,
      clampDays(raw.days),
    ),
    items,
  };
}

export function coerceNamedShoppingLists(
  listsUnknown: unknown,
  activeIdUnknown: unknown,
): {
  shoppingLists: NamedShoppingList[];
  activeShoppingListId: string | null;
} {
  if (!Array.isArray(listsUnknown)) {
    return { shoppingLists: [], activeShoppingListId: null };
  }
  const coerced = listsUnknown
    .map(coerceOneNamedList)
    .filter((list): list is NamedShoppingList => list != null);
  coerced.sort((a, b) => {
    if (a.updatedAt !== b.updatedAt) return b.updatedAt.localeCompare(a.updatedAt);
    return a.id.localeCompare(b.id);
  });
  const kept = coerced.slice(0, 8);
  const requested =
    typeof activeIdUnknown === "string" && activeIdUnknown.length > 0
      ? activeIdUnknown
      : null;

  let activeId: string | null = null;
  if (requested != null) {
    activeId = kept.some((list) => list.id === requested) ? requested : null;
  } else {
    const actives = kept.filter((list) => list.status === "active");
    if (actives.length > 0) {
      activeId = actives[0].id;
    }
  }

  const shoppingLists = kept.map((list) => ({
    ...list,
    status: (activeId && list.id === activeId
      ? "active"
      : "archived") as NamedShoppingList["status"],
  }));
  return { shoppingLists, activeShoppingListId: activeId };
}

export function shoppingListsToChecked(
  lists: NamedShoppingList[],
  activeId: string | null,
): Record<string, boolean> {
  const list = lists.find((row) => row.id === activeId);
  if (!list) return {};
  const out: Record<string, boolean> = {};
  for (const item of list.items) {
    if (item.checked) out[item.ingredientId] = true;
  }
  return out;
}

export function truncateListName(
  name: string,
  existingNames: string[] = [],
): string {
  const trimmed = name.trim();
  const base = trimmed || defaultShoppingListName(existingNames);
  return base.slice(0, 40);
}

export function defaultShoppingListName(
  existingNames: string[],
  now = new Date(),
): string {
  const base = `${now.getMonth() + 1}月${now.getDate()}日清单`;
  if (!existingNames.includes(base)) return base;
  let n = 2;
  while (existingNames.includes(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

export function newShoppingListId(now = Date.now()): string {
  return `sl-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function mealsEqual(
  a: { day: number; slot: string; recipeId: string }[],
  b: { day: number; slot: string; recipeId: string }[],
): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (meal, i) =>
      meal.day === b[i].day &&
      meal.slot === b[i].slot &&
      meal.recipeId === b[i].recipeId,
  );
}

export function microAdjustEqual(
  a: { day: number; ingredientId: string; grams: number }[],
  b: { day: number; ingredientId: string; grams: number }[],
): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (row, i) =>
      row.day === b[i].day &&
      row.ingredientId === b[i].ingredientId &&
      row.grams === b[i].grams,
  );
}

export function sameShoppingSource(
  list: NamedShoppingList,
  plan: MealPlan | InfeasiblePlan | null,
  planStartedOn: string | null,
): boolean {
  if (!plan || plan.feasible !== true) return false;
  return (
    list.planStartedOn === planStartedOn &&
    mealsEqual(list.linkedMeals, plan.meals) &&
    microAdjustEqual(list.linkedMicroAdjust, plan.microAdjust)
  );
}

export function isUsableShoppingList(
  list: NamedShoppingList | undefined,
  plan: MealPlan | InfeasiblePlan | null,
  planStartedOn: string | null,
): list is NamedShoppingList {
  return (
    list != null &&
    !list.stale &&
    sameShoppingSource(list, plan, planStartedOn)
  );
}

export function uncheckActiveListItems(
  lists: NamedShoppingList[],
  activeId: string | null,
): NamedShoppingList[] {
  return lists.map((list) =>
    list.id === activeId
      ? {
          ...list,
          items: list.items.map((item) => ({ ...item, checked: false })),
        }
      : list,
  );
}

export function markActiveStale(
  lists: NamedShoppingList[],
  activeId: string | null,
): NamedShoppingList[] {
  return lists.map((list) =>
    list.id === activeId ? { ...list, stale: true } : list,
  );
}

function checkedRecord(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, boolean> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (val === true) out[key] = true;
  }
  return out;
}

function migrateToNamedLists(state: PersistSnapshot): PersistSnapshot {
  const plan = coercePlan(state.plan);
  const pantry = coercePantry(state.pantry);
  const days = clampDays(state.days);
  const checked = checkedRecord(state.shoppingChecked);
  const planStartedOn = coercePlanStartedOn(state.planStartedOn, plan);
  let shoppingLists: NamedShoppingList[] = [];
  let activeShoppingListId: string | null = null;
  if (plan && plan.feasible === true) {
    const lines = flattenShoppingList(
      buildShoppingList(plan, pantry, ingredients, recipes, days),
    );
    const items: ShoppingListItem[] = lines.map((line) => ({
      ...line,
      checked: checked[line.ingredientId] === true,
    }));
    const now = new Date().toISOString();
    const list: NamedShoppingList = {
      id: newShoppingListId(),
      name: defaultShoppingListName([]),
      status: "active",
      stale: false,
      createdAt: now,
      updatedAt: now,
      sourceId: "user-shelf",
      days,
      planStartedOn,
      linkedMeals: plan.meals,
      linkedMicroAdjust: plan.microAdjust,
      items,
    };
    shoppingLists = [list];
    activeShoppingListId = list.id;
  }
  const rest: PersistSnapshot = { ...state };
  delete rest.shoppingChecked;
  return {
    ...rest,
    scopeMode: "catalog",
    wantedRecipeIds: [],
    shoppingLists,
    activeShoppingListId,
  };
}

let persistResetNotice: "parse" | "profile" | null = null;

export function markPersistReset(reason: "parse" | "profile"): void {
  if (persistResetNotice == null) persistResetNotice = reason;
}

export function consumePersistResetNotice(): "parse" | "profile" | null {
  const value = persistResetNotice;
  persistResetNotice = null;
  return value;
}

export function persistHadReset(): boolean {
  return persistResetNotice != null;
}

export function sanitizePersisted(state: unknown): PersistSnapshot {
  const raw =
    state && typeof state === "object"
      ? (state as Record<string, unknown>)
      : {};
  const picked: PersistSnapshot = {};
  for (const key of PERSIST_FIELD_KEYS) {
    if (key in raw) {
      (picked as Record<string, unknown>)[key] = raw[key];
    }
  }
  const plan = "plan" in picked ? coercePlan(picked.plan) : undefined;
  const named = coerceNamedShoppingLists(
    picked.shoppingLists,
    picked.activeShoppingListId,
  );
  let profileCorrupt = false;
  const out: PersistSnapshot = {
    planStyle: coercePlanStyle(picked.planStyle),
    basketUndo: coerceBasketUndo(picked.basketUndo),
    planStartedOn: coercePlanStartedOn(
      picked.planStartedOn,
      plan === undefined ? null : plan,
    ),
    scopeMode: coerceScopeMode(picked.scopeMode),
    wantedRecipeIds: Array.isArray(picked.wantedRecipeIds)
      ? picked.wantedRecipeIds
          .filter(
            (id): id is string =>
              typeof id === "string" && KNOWN_RECIPE_IDS.has(id),
          )
          .slice(0, 40)
      : [],
    shoppingLists: named.shoppingLists,
    activeShoppingListId: named.activeShoppingListId,
    customIngredients: coerceCustomIngredients(picked.customIngredients),
  };
  if ("profile" in picked) {
    if (!picked.profile) {
      out.profile = null;
    } else {
      const coerced = coerceProfile(picked.profile);
      out.profile = coerced;
      if (coerced == null) {
        markPersistReset("profile");
        profileCorrupt = true;
      }
    }
  }
  if ("pantry" in picked) {
    out.pantry = coercePantry(picked.pantry);
  }
  if ("basketIds" in picked) {
    const rawIds = Array.isArray(picked.basketIds)
      ? picked.basketIds.filter(
          (id): id is string =>
            typeof id === "string" &&
            !DANGEROUS_KEYS.has(id) &&
            KNOWN_INGREDIENT_IDS.has(id),
        )
      : [];
    const profileForBasket = out.profile ?? null;
    out.basketIds =
      profileForBasket != null
        ? sanitizeBasket(
            rawIds,
            profileForBasket,
            ingredients,
            allIngredientIds(),
          )
        : rawIds;
  }
  if ("days" in picked) out.days = clampDays(picked.days);
  if ("plan" in picked) out.plan = plan ?? null;
  if (
    typeof picked.progressStep === "number" &&
    Number.isInteger(picked.progressStep)
  ) {
    out.progressStep = Math.min(5, Math.max(1, picked.progressStep));
  }
  if (profileCorrupt) {
    out.plan = null;
    out.planStartedOn = null;
  }
  const profileForStrip = out.profile ?? null;
  if (profileForStrip) {
    const catalog = allIngredientIds();
    const byId = new Map(ingredients.map((item) => [item.id, item]));
    const blocked = (id: string) =>
      isBasketIdBlocked(id, profileForStrip, byId, catalog);
    if (out.basketUndo) {
      out.basketUndo = {
        ...out.basketUndo,
        ids: sanitizeBasket(
          out.basketUndo.ids,
          profileForStrip,
          ingredients,
          catalog,
        ),
      };
    }
    if (out.plan && out.plan.feasible === true) {
      const microAdjust = out.plan.microAdjust.filter(
        (row) => !blocked(row.ingredientId),
      );
      out.plan = {
        ...out.plan,
        microAdjust,
        dailyActual: actualFromMeals(out.plan.meals, out.plan.days, microAdjust),
      };
    }
    out.shoppingLists = (out.shoppingLists ?? []).map((list) => ({
      ...list,
      items: list.items.filter((item) => !blocked(item.ingredientId)),
      linkedMicroAdjust: list.linkedMicroAdjust.filter(
        (row) => !blocked(row.ingredientId),
      ),
    }));
  }
  return out;
}

export function migratePlan<T extends PersistSnapshot>(
  state: T,
  version: number,
  knownRecipeIds: Iterable<string>,
  defaultBasketIds: readonly string[] = [],
): T & {
  planStyle: PlanStyle;
  basketUndo: BasketUndo | null;
  planStartedOn: string | null;
  scopeMode: ScopeMode;
  wantedRecipeIds: string[];
  shoppingLists: NamedShoppingList[];
  activeShoppingListId: string | null;
} {
  let next: PersistSnapshot = { ...state };
  if (version < 2) {
    const incoming = Array.isArray(state.basketIds) ? state.basketIds : [];
    const allowed = new Set<string>(defaultBasketIds);
    const kept = incoming.filter((id) => allowed.has(id));
    const missing = defaultBasketIds.filter((id) => !kept.includes(id));
    next = { ...next, basketIds: [...kept, ...missing] };
  }
  if (version < 4) {
    const known = new Set(knownRecipeIds);
    const plan = next.plan;
    const meals =
      plan && plan.feasible !== false && Array.isArray(plan.meals)
        ? plan.meals
        : null;
    if (meals?.some((meal) => !known.has(meal.recipeId))) {
      next = { ...next, plan: null };
    }
  }
  if (version < 6) {
    next = migrateToNamedLists(next);
  }
  if (version < 7) {
    next = { ...next };
  }
  if (version < 8) {
    if (coerceScopeMode(next.scopeMode) !== "basket") {
      next = { ...next, basketIds: commonKitchenIds() };
    }
    next = { ...next, customIngredients: [] };
  }
  return sanitizePersisted(next) as T & {
    planStyle: PlanStyle;
    basketUndo: BasketUndo | null;
    planStartedOn: string | null;
    scopeMode: ScopeMode;
    wantedRecipeIds: string[];
    shoppingLists: NamedShoppingList[];
    activeShoppingListId: string | null;
  };
}
