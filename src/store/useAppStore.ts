import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { allIngredientIds, resolveUniverse } from "@/domain/availability";
import { sanitizeBasket } from "@/domain/basketSanitize";
import { ingredients, recipes } from "@/domain/data";
import { computeTarget } from "@/domain/nutrition";
import { recomputeMicroAdjust } from "@/domain/planner";
import { buildShoppingList, flattenShoppingList } from "@/domain/shoppingList";
import type { BasketPlanPreview } from "@/domain/recommend";
import type {
  BasketUndo,
  CustomIngredient,
  InfeasiblePlan,
  ListUndo,
  MealPlan,
  NamedShoppingList,
  PantryItem,
  PlanStyle,
  ScopeMode,
  ShoppingListItem,
  UserProfile,
} from "@/domain/types";
import { localYmd } from "@/lib/planDay";
import {
  clampDays,
  coerceBasketUndo,
  coerceCustomIngredients,
  coercePantry,
  coerceProfile,
  coercePlanStyle,
  coerceScopeMode,
  defaultShoppingListName,
  markPersistReset,
  migratePlan,
  newShoppingListId,
  sanitizePersisted,
  markActiveStale,
  sameShoppingSource,
  truncateListName,
} from "./persistMigrate";

export const DEFAULT_BASKET_IDS = [
  "chicken-breast",
  "egg",
  "brown-rice",
  "oats",
  "broccoli",
  "tomato",
  "banana",
  "greek-yogurt",
  "olive-oil",
] as const;

export const DEFAULT_DAYS = 3;

const memoryStorage = new Map<string, string>();

function readPersistRaw(name: string): string | null {
  try {
    if (typeof localStorage !== "undefined") return localStorage.getItem(name);
  } catch {
    /* node / private mode */
  }
  return memoryStorage.get(name) ?? null;
}

const persistStorage = {
  getItem: (name: string) => {
    const raw = readPersistRaw(name);
    if (raw == null) return null;
    try {
      JSON.parse(raw);
      return raw;
    } catch {
      markPersistReset("parse");
      return null;
    }
  },
  setItem: (name: string, value: string) => {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(name, value);
        return;
      }
    } catch {
      /* ignore */
    }
    memoryStorage.set(name, value);
  },
  removeItem: (name: string) => {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(name);
        return;
      }
    } catch {
      /* ignore */
    }
    memoryStorage.delete(name);
  },
};

export interface AppState {
  profile: UserProfile | null;
  pantry: PantryItem[];
  basketIds: string[];
  days: number;
  plan: MealPlan | InfeasiblePlan | null;
  progressStep: number;
  planStyle: PlanStyle;
  basketUndo: BasketUndo | null;
  planStartedOn: string | null;
  scopeMode: ScopeMode;
  wantedRecipeIds: string[];
  shoppingLists: NamedShoppingList[];
  activeShoppingListId: string | null;
  listUndo: ListUndo | null;
  customIngredients: CustomIngredient[];
  setProfile: (
    profile: UserProfile,
    opts?: { resetPlan?: boolean; recomputeMicro?: boolean },
  ) => void;
  setPantry: (pantry: PantryItem[]) => void;
  setBasketIds: (ids: string[]) => void;
  toggleBasketId: (id: string) => void;
  setDays: (days: number) => void;
  setPlanStyle: (planStyle: PlanStyle) => void;
  setScopeMode: (scopeMode: ScopeMode) => void;
  addCustomIngredient: (item: CustomIngredient) => void;
  removeCustomIngredient: (id: string) => void;
  toggleWanted: (recipeId: string) => void;
  setPlan: (
    plan: MealPlan | InfeasiblePlan | null,
    options?: { planStyle?: PlanStyle },
  ) => void;
  patchPlan: (plan: MealPlan | InfeasiblePlan) => void;
  applyBasketPreview: (preview: BasketPlanPreview) => void;
  undoBasketPreview: () => void;
  toggleListItemChecked: (ingredientId: string) => void;
  removeListItem: (ingredientId: string) => void;
  commitShoppingSnapshot: (mode?: "overwrite" | "saveAs") => boolean;
  activateShoppingList: (id: string) => void;
  archiveActiveList: () => void;
  deleteShoppingList: (id: string) => void;
  dropOldestShoppingList: () => string | null;
  renameShoppingList: (id: string, name: string) => void;
  undoListChange: () => void;
  setProgressStep: (step: number) => void;
  resetAll: () => void;
}

const initialState = {
  profile: null as UserProfile | null,
  pantry: [] as PantryItem[],
  basketIds: [] as string[],
  days: DEFAULT_DAYS,
  plan: null as MealPlan | InfeasiblePlan | null,
  progressStep: 1,
  planStyle: "easy" as PlanStyle,
  basketUndo: null as BasketUndo | null,
  planStartedOn: null as string | null,
  scopeMode: "catalog" as ScopeMode,
  wantedRecipeIds: [] as string[],
  shoppingLists: [] as NamedShoppingList[],
  activeShoppingListId: null as string | null,
  listUndo: null as ListUndo | null,
  customIngredients: [] as CustomIngredient[],
};

function stalePlanReset(
  hasPlan: boolean,
  shoppingLists: NamedShoppingList[],
  activeId: string | null,
) {
  if (!hasPlan) return {};
  return {
    plan: null as MealPlan | InfeasiblePlan | null,
    planStartedOn: null as string | null,
    shoppingLists: markActiveStale(shoppingLists, activeId),
  };
}

function snapshotUndo(state: {
  shoppingLists: NamedShoppingList[];
  activeShoppingListId: string | null;
}): ListUndo {
  return {
    lists: state.shoppingLists,
    activeId: state.activeShoppingListId,
    expiresAt: Date.now() + 10_000,
  };
}

function sameIdList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

export function getActiveShoppingList(state: {
  shoppingLists: NamedShoppingList[];
  activeShoppingListId: string | null;
}): NamedShoppingList | undefined {
  return state.shoppingLists.find(
    (list) => list.id === state.activeShoppingListId,
  );
}

export function shoppingListBought(
  list: NamedShoppingList,
  categoryOf: (id: string) => string | undefined,
): boolean {
  const buy = list.items.filter(
    (item) => categoryOf(item.ingredientId) !== "seasoning",
  );
  if (buy.length === 0) return false;
  return buy.every((item) => item.checked);
}

export function isShoppingItemChecked(
  list: NamedShoppingList | undefined,
  ingredientId: string,
): boolean {
  return (
    list?.items.find((item) => item.ingredientId === ingredientId)?.checked ===
    true
  );
}

function makeSkeletonList(
  existing: NamedShoppingList[],
  days: number,
  planStartedOn: string | null,
): NamedShoppingList {
  const now = new Date().toISOString();
  return {
    id: newShoppingListId(),
    name: defaultShoppingListName(existing.map((list) => list.name)),
    status: "active",
    stale: false,
    createdAt: now,
    updatedAt: now,
    sourceId: "user-shelf",
    days,
    planStartedOn,
    linkedMeals: [],
    linkedMicroAdjust: [],
    items: [],
  };
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...initialState,
      setProfile: (profile, opts) => {
        const next = coerceProfile(profile);
        if (!next) return;
        const basketIds = sanitizeBasket(
          get().basketIds,
          next,
          ingredients,
          allIngredientIds(),
        );
        const undo = get().basketUndo;
        const patch: Partial<AppState> = {
          profile: next,
          progressStep: 2,
          basketIds,
          basketUndo: undo
            ? {
                ...undo,
                ids: sanitizeBasket(
                  undo.ids,
                  next,
                  ingredients,
                  allIngredientIds(),
                ),
              }
            : undo,
        };
        if (opts?.resetPlan) {
          patch.plan = null;
          patch.planStartedOn = null;
          patch.shoppingLists = markActiveStale(
            get().shoppingLists,
            get().activeShoppingListId,
          );
        } else if (opts?.recomputeMicro) {
          const current = get().plan;
          if (current && current.feasible === true) {
            const universe = resolveUniverse(
              basketIds,
              get().customIngredients,
            );
            patch.plan = recomputeMicroAdjust(
              current,
              recipes,
              computeTarget(next),
              {
                profile: next,
                ingredients,
                universe,
                planStyle: get().planStyle,
              },
            );
            patch.shoppingLists = markActiveStale(
              get().shoppingLists,
              get().activeShoppingListId,
            );
          }
        }
        set(patch);
      },
      setPantry: (pantry) => set({ pantry: coercePantry(pantry) }),
      setBasketIds: (basketIds) => {
        if (sameIdList(get().basketIds, basketIds)) return;
        set({
          basketIds,
          basketUndo: null,
          ...stalePlanReset(
            get().plan != null,
            get().shoppingLists,
            get().activeShoppingListId,
          ),
        });
      },
      toggleBasketId: (id) => {
        const cur = get().basketIds;
        const basketIds = cur.includes(id)
          ? cur.filter((x) => x !== id)
          : [...cur, id];
        if (sameIdList(cur, basketIds)) return;
        set({
          basketIds,
          basketUndo: null,
          ...stalePlanReset(
            get().plan != null,
            get().shoppingLists,
            get().activeShoppingListId,
          ),
        });
      },
      setDays: (days) => {
        const next = clampDays(days, get().days);
        if (next === get().days) return;
        set({
          days: next,
          basketUndo: null,
          ...stalePlanReset(
            get().plan != null,
            get().shoppingLists,
            get().activeShoppingListId,
          ),
        });
      },
      setPlanStyle: (planStyle) => {
        const next = coercePlanStyle(planStyle);
        if (next === get().planStyle) return;
        set({
          planStyle: next,
          basketUndo: null,
          ...stalePlanReset(
            get().plan != null,
            get().shoppingLists,
            get().activeShoppingListId,
          ),
        });
      },
      setScopeMode: (scopeMode) => {
        const next = coerceScopeMode(scopeMode);
        if (next === get().scopeMode) return;
        set({ scopeMode: next });
      },
      addCustomIngredient: (item) => {
        const next = coerceCustomIngredients([
          ...get().customIngredients,
          item,
        ]);
        set({
          customIngredients: next,
          ...stalePlanReset(
            get().plan != null,
            get().shoppingLists,
            get().activeShoppingListId,
          ),
        });
      },
      removeCustomIngredient: (id) => {
        const customIngredients = get().customIngredients.filter(
          (row) => row.id !== id,
        );
        set({
          customIngredients,
          ...stalePlanReset(
            get().plan != null,
            get().shoppingLists,
            get().activeShoppingListId,
          ),
        });
      },
      toggleWanted: (recipeId) => {
        const cur = get().wantedRecipeIds;
        const wantedRecipeIds = cur.includes(recipeId)
          ? cur.filter((id) => id !== recipeId)
          : [...cur, recipeId];
        set({ wantedRecipeIds });
      },
      setPlan: (plan, options) =>
        set({
          plan,
          shoppingLists: markActiveStale(
            get().shoppingLists,
            get().activeShoppingListId,
          ),
          basketUndo: null,
          planStartedOn: plan?.feasible === true ? localYmd() : null,
          ...(options?.planStyle
            ? { planStyle: coercePlanStyle(options.planStyle) }
            : {}),
        }),
      patchPlan: (plan) => {
        const state = get();
        const active = getActiveShoppingList(state);
        const wasSame =
          active != null &&
          sameShoppingSource(active, state.plan, state.planStartedOn);
        set({
          plan,
          shoppingLists: wasSame
            ? markActiveStale(state.shoppingLists, state.activeShoppingListId)
            : state.shoppingLists,
        });
      },
      applyBasketPreview: (preview) => {
        if (!preview.ok) return;
        const snapshot: BasketUndo = {
          ids: get().basketIds,
          planStyle: get().planStyle,
          days: get().days,
        };
        const profile = get().profile;
        const basketIds = profile
          ? sanitizeBasket(
              preview.ids,
              profile,
              ingredients,
              allIngredientIds(),
            )
          : preview.ids;
        set({
          basketIds,
          planStyle: coercePlanStyle(preview.style),
          basketUndo: snapshot,
          ...stalePlanReset(
            get().plan != null,
            get().shoppingLists,
            get().activeShoppingListId,
          ),
        });
      },
      undoBasketPreview: () => {
        const undo = coerceBasketUndo(get().basketUndo);
        if (!undo) return;
        const profile = get().profile;
        const ids = profile
          ? sanitizeBasket(
              undo.ids,
              profile,
              ingredients,
              allIngredientIds(),
            )
          : undo.ids;
        set({
          basketIds: ids,
          planStyle: undo.planStyle,
          days: undo.days,
          basketUndo: null,
          ...stalePlanReset(
            get().plan != null,
            get().shoppingLists,
            get().activeShoppingListId,
          ),
        });
      },
      commitShoppingSnapshot: (mode = "overwrite") => {
        const state = get();
        const plan = state.plan;
        if (!plan || plan.feasible !== true) return false;
        const lines = flattenShoppingList(
          buildShoppingList(
            plan,
            state.pantry,
            ingredients,
            recipes,
            state.days,
          ),
        );
        const now = new Date().toISOString();
        const active = getActiveShoppingList(state);
        const preserveFrom = mode === "overwrite" ? active : undefined;
        const items: ShoppingListItem[] = lines.map((line) => ({
          ...line,
          checked:
            preserveFrom?.items.find(
              (row) => row.ingredientId === line.ingredientId,
            )?.checked === true,
        }));
        const makeList = (namePool: NamedShoppingList[]): NamedShoppingList => ({
          id: newShoppingListId(),
          name: defaultShoppingListName(namePool.map((row) => row.name)),
          status: "active",
          stale: false,
          createdAt: now,
          updatedAt: now,
          sourceId: "user-shelf",
          days: state.days,
          planStartedOn: state.planStartedOn,
          linkedMeals: plan.meals,
          linkedMicroAdjust: plan.microAdjust,
          items,
        });
        if (!active || mode === "saveAs") {
          if (state.shoppingLists.length >= 8) return false;
          const lists = state.shoppingLists.map((row) =>
            row.status === "active"
              ? { ...row, status: "archived" as const }
              : row,
          );
          const list = makeList(lists);
          set({
            shoppingLists: [...lists, list],
            activeShoppingListId: list.id,
            listUndo: null,
          });
          return true;
        }
        set({
          shoppingLists: state.shoppingLists.map((row) =>
            row.id === active.id
              ? {
                  ...row,
                  items,
                  stale: false,
                  days: state.days,
                  planStartedOn: state.planStartedOn,
                  linkedMeals: plan.meals,
                  linkedMicroAdjust: plan.microAdjust,
                  updatedAt: now,
                }
              : row,
          ),
          listUndo: null,
        });
        return true;
      },
      activateShoppingList: (id) => {
        const state = get();
        if (!state.shoppingLists.some((list) => list.id === id)) return;
        set({
          shoppingLists: state.shoppingLists.map((list) => ({
            ...list,
            status: list.id === id ? ("active" as const) : ("archived" as const),
          })),
          activeShoppingListId: id,
          listUndo: null,
        });
      },
      renameShoppingList: (id, name) => {
        const others = get()
          .shoppingLists.filter((list) => list.id !== id)
          .map((list) => list.name);
        const next = truncateListName(name, others);
        set({
          shoppingLists: get().shoppingLists.map((list) =>
            list.id === id
              ? { ...list, name: next, updatedAt: new Date().toISOString() }
              : list,
          ),
          listUndo: null,
        });
      },
      archiveActiveList: () => {
        const state = get();
        const active = getActiveShoppingList(state);
        if (!active) return;
        set({
          shoppingLists: state.shoppingLists.map((list) =>
            list.id === active.id
              ? { ...list, status: "archived" as const }
              : list,
          ),
          activeShoppingListId: null,
          listUndo: snapshotUndo(state),
        });
      },
      dropOldestShoppingList: () => {
        const state = get();
        if (state.shoppingLists.length === 0) return null;
        const oldest = [...state.shoppingLists].sort((a, b) => {
          if (a.updatedAt !== b.updatedAt) {
            return a.updatedAt.localeCompare(b.updatedAt);
          }
          return a.id.localeCompare(b.id);
        })[0];
        const next = state.shoppingLists.filter((list) => list.id !== oldest.id);
        set({
          shoppingLists: next,
          activeShoppingListId:
            state.activeShoppingListId === oldest.id
              ? null
              : state.activeShoppingListId,
        });
        return oldest.name;
      },
      deleteShoppingList: (id) => {
        const state = get();
        const next = state.shoppingLists.filter((list) => list.id !== id);
        const activeId =
          state.activeShoppingListId === id ? null : state.activeShoppingListId;
        set({
          shoppingLists: next,
          activeShoppingListId: activeId,
          listUndo: snapshotUndo(state),
        });
      },
      undoListChange: () => {
        const undo = get().listUndo;
        if (!undo || Date.now() > undo.expiresAt) {
          set({ listUndo: null });
          return;
        }
        set({
          shoppingLists: undo.lists,
          activeShoppingListId: undo.activeId,
          listUndo: null,
        });
      },
      removeListItem: (ingredientId) => {
        const state = get();
        const active = getActiveShoppingList(state);
        if (!active) return;
        set({
          shoppingLists: state.shoppingLists.map((list) =>
            list.id === active.id
              ? {
                  ...list,
                  items: list.items.filter(
                    (item) => item.ingredientId !== ingredientId,
                  ),
                  updatedAt: new Date().toISOString(),
                }
              : list,
          ),
          listUndo: snapshotUndo(state),
        });
      },
      toggleListItemChecked: (ingredientId) => {
        const state = get();
        let lists = state.shoppingLists;
        let activeId = state.activeShoppingListId;
        let active = lists.find((list) => list.id === activeId);
        if (!active) {
          const skeleton = makeSkeletonList(
            lists,
            state.days,
            state.planStartedOn,
          );
          lists = lists.map((list) =>
            list.status === "active"
              ? { ...list, status: "archived" as const }
              : list,
          );
          lists = [...lists, skeleton];
          active = skeleton;
          activeId = skeleton.id;
        }
        const existing = active.items.find(
          (item) => item.ingredientId === ingredientId,
        );
        let items: ShoppingListItem[];
        if (!existing) {
          items = [
            ...active.items,
            {
              ingredientId,
              needGrams: 0,
              packs: 0,
              packGrams: 0,
              surplusGrams: 0,
              checked: true,
            },
          ];
        } else {
          items = active.items.map((item) =>
            item.ingredientId === ingredientId
              ? { ...item, checked: !item.checked }
              : item,
          );
        }
        const updatedAt = new Date().toISOString();
        set({
          shoppingLists: lists.map((list) =>
            list.id === activeId ? { ...list, items, updatedAt } : list,
          ),
          activeShoppingListId: activeId,
          listUndo: null,
        });
      },
      setProgressStep: (progressStep) => set({ progressStep }),
      resetAll: () => set({ ...initialState, basketIds: [] }),
    }),
    {
      name: "aislemeal:v1",
      version: 8,
      storage: createJSONStorage(() => persistStorage),
      migrate: (persisted, version) =>
        migratePlan(
          (persisted ?? {}) as AppState,
          version,
          recipes.map((recipe) => recipe.id),
          DEFAULT_BASKET_IDS,
        ),
      merge: (persisted, current): AppState => ({
        ...current,
        ...sanitizePersisted(persisted ?? {}),
      }),
      partialize: (state) => ({
        profile: state.profile,
        pantry: state.pantry,
        basketIds: state.basketIds,
        days: state.days,
        plan: state.plan,
        progressStep: state.progressStep,
        planStyle: state.planStyle,
        basketUndo: state.basketUndo,
        planStartedOn: state.planStartedOn,
        scopeMode: state.scopeMode,
        wantedRecipeIds: state.wantedRecipeIds,
        shoppingLists: state.shoppingLists,
        activeShoppingListId: state.activeShoppingListId,
        customIngredients: state.customIngredients,
      }),
    },
  ),
);
