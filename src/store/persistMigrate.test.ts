import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { ingredients, recipes } from "@/domain/data";
import { commonKitchenIds } from "@/domain/shelf";
import type { BasketPlanPreview } from "@/domain/recommend";
import type { InfeasiblePlan, MealPlan, UserProfile } from "@/domain/types";
import { localYmd } from "@/lib/planDay";
import { computeTarget, planSlotBudget, remainingTarget, recipeMacros } from "@/domain/nutrition";
import {
  coerceNamedShoppingLists,
  coercePlan,
  coerceProfile,
  consumePersistResetNotice,
  isUsableShoppingList,
  migratePlan,
  persistHadReset,
  shoppingListsToChecked,
  truncateListName,
} from "./persistMigrate";
import {
  DEFAULT_BASKET_IDS,
  getActiveShoppingList,
  isShoppingItemChecked,
  shoppingListBought,
  useAppStore,
} from "./useAppStore";
import type { NamedShoppingList } from "@/domain/types";

const known = recipes.map((recipe) => recipe.id);

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

const THREE_MEALS: UserProfile["enabledSlots"] = [
  "breakfast",
  "lunch",
  "dinner",
];
const T1_COERCED: UserProfile = { ...T1, enabledSlots: [...THREE_MEALS] };

const sampleMacros = recipeMacros(
  recipes[0],
  new Map(ingredients.map((item) => [item.id, item])),
);
const samplePlan: MealPlan = {
  feasible: true,
  days: 1,
  meals: [{ day: 0, slot: "lunch", recipeId: recipes[0].id }],
  dailyActual: [sampleMacros],
  microAdjust: [],
};

const infeasible: InfeasiblePlan = {
  feasible: false,
  reason: "no_recipes_for_slot",
  blockedSlots: ["lunch"],
  suggestions: [],
};

function preview(partial: Partial<BasketPlanPreview> = {}): BasketPlanPreview {
  return {
    style: "variety",
    ids: ["chicken-breast", "egg"],
    keepIds: ["egg"],
    addIds: ["chicken-breast"],
    removeIds: [],
    breakfastCount: 1,
    mainsCount: 1,
    uniquePlanned: 2,
    repeatMeals: 0,
    packCount: 4,
    ok: true,
    ...partial,
  };
}

describe("migratePlan", () => {
  it("v<2 再升 v8 成常见厨房", () => {
    const next = migratePlan(
      { basketIds: ["egg", "unknown-id"], plan: samplePlan },
      1,
      known,
      DEFAULT_BASKET_IDS,
    );
    expect(new Set(next.basketIds)).toEqual(new Set(commonKitchenIds()));
    expect(next.basketIds?.includes("unknown-id")).toBe(false);
    expect(next.planStyle).toBe("easy");
    expect(next.basketUndo).toBeNull();
    expect(next.planStartedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("v<4 未知 recipeId 清 plan，已知保留", () => {
    const dropped = migratePlan({
      plan: {
        ...samplePlan,
        meals: [{ day: 0, slot: "lunch", recipeId: "ghost-recipe" }],
      },
    }, 3, known);
    expect(dropped.plan).toBeNull();
    expect(dropped.planStartedOn).toBeNull();
    const kept = migratePlan({ plan: samplePlan, basketIds: ["egg"] }, 3, known);
    expect(kept.plan).not.toBeNull();
    expect(kept.planStyle).toBe("easy");
    expect(kept.planStartedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const pepper = migratePlan(
      {
        plan: {
          ...samplePlan,
          meals: [{ day: 0, slot: "lunch", recipeId: "pepper-chicken-broccoli-rice" }],
        },
      },
      3,
      known,
    );
    expect(pepper.plan).toBeNull();
  });

  it("v4 blob 补缺 planStyle，可行 plan 回填 planStartedOn，丢掉 cookProgress", () => {
    const next = migratePlan(
      {
        profile: T1,
        basketIds: [...DEFAULT_BASKET_IDS],
        days: 7,
        plan: samplePlan,
        cookProgress: { "0-lunch": { done: true } },
      } as Parameters<typeof migratePlan>[0] & { cookProgress: unknown },
      4,
      known,
    );
    expect(next.profile).toEqual(T1_COERCED);
    expect(next.plan).toEqual(samplePlan);
    expect(next.planStyle).toBe("easy");
    expect(next.basketUndo).toBeNull();
    expect(next.planStartedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Object.prototype.hasOwnProperty.call(next, "cookProgress")).toBe(
      false,
    );
  });

  it("已有 variety 不覆盖；非法 planStyle/天数被夹紧", () => {
    const next = migratePlan(
      {
        planStyle: "variety" as const,
        basketUndo: { ids: ["egg"], planStyle: "easy" as const, days: 3 },
        planStartedOn: "2026-08-20",
      },
      5,
      known,
    );
    expect(next.planStyle).toBe("variety");
    expect(next.basketUndo).toEqual({
      ids: ["egg"],
      planStyle: "easy",
      days: 3,
    });
    expect(next.planStartedOn).toBe("2026-08-20");
    const clamped = migratePlan(
      { days: Number.POSITIVE_INFINITY, planStyle: "nope" as "easy" },
      5,
      known,
    );
    expect(clamped.days).toBe(3);
    expect(clamped.planStyle).toBe("easy");
    const infinitePlan = migratePlan(
      { plan: { ...samplePlan, days: Number.POSITIVE_INFINITY } },
      5,
      known,
    );
    expect(infinitePlan.plan && infinitePlan.plan.feasible).toBe(true);
    if (infinitePlan.plan && infinitePlan.plan.feasible) {
      expect(infinitePlan.plan.days).toBe(3);
    }
    const missingMeals = migratePlan(
      { plan: { feasible: true, days: 1 } as MealPlan },
      3,
      known,
    );
    expect(missingMeals.plan).toBeNull();
  });
});

describe("applyBasketPreview / undo / setPlan", () => {
  beforeEach(() => {
    useAppStore.getState().resetAll();
  });

  it("applyBasketPreview 标 active 清单 stale，isUsableShoppingList 为 false", () => {
    useAppStore.getState().setPlan(samplePlan);
    useAppStore.getState().commitShoppingSnapshot();
    const before = getActiveShoppingList(useAppStore.getState());
    expect(before).toBeTruthy();
    if (!before) throw new Error("missing list");
    expect(before.stale).toBe(false);
    expect(
      isUsableShoppingList(
        before,
        samplePlan,
        useAppStore.getState().planStartedOn,
      ),
    ).toBe(true);
    const items = before.items;
    useAppStore.getState().applyBasketPreview(preview());
    const after = useAppStore
      .getState()
      .shoppingLists.find((list) => list.id === before.id);
    expect(after?.stale).toBe(true);
    expect(after?.items).toEqual(items);
    expect(
      isUsableShoppingList(
        after,
        useAppStore.getState().plan,
        useAppStore.getState().planStartedOn,
      ),
    ).toBe(false);
  });

  it("应用快照 ids+style，撤销恢复，setter 内清 undo", () => {
    useAppStore.getState().setBasketIds(["egg"]);
    useAppStore.getState().setPlanStyle("easy");
    useAppStore.getState().setDays(3);
    useAppStore.getState().applyBasketPreview(preview());
    expect(useAppStore.getState().basketIds).toEqual(["chicken-breast", "egg"]);
    expect(useAppStore.getState().planStyle).toBe("variety");
    expect(useAppStore.getState().days).toBe(3);
    expect(useAppStore.getState().plan).toBeNull();
    expect(useAppStore.getState().planStartedOn).toBeNull();
    expect(useAppStore.getState().basketUndo).toEqual({
      ids: ["egg"],
      planStyle: "easy",
      days: 3,
    });
    useAppStore.getState().undoBasketPreview();
    expect(useAppStore.getState().basketIds).toEqual(["egg"]);
    expect(useAppStore.getState().planStyle).toBe("easy");
    expect(useAppStore.getState().days).toBe(3);
    expect(useAppStore.getState().basketUndo).toBeNull();

    useAppStore.getState().applyBasketPreview(preview());
    useAppStore.getState().toggleBasketId("banana");
    expect(useAppStore.getState().basketUndo).toBeNull();

    useAppStore.getState().applyBasketPreview(preview());
    useAppStore.getState().setBasketIds(["tomato"]);
    expect(useAppStore.getState().basketUndo).toBeNull();

    useAppStore.getState().applyBasketPreview(preview());
    useAppStore.getState().setDays(5);
    expect(useAppStore.getState().basketUndo).toBeNull();

    useAppStore.getState().applyBasketPreview(preview());
    useAppStore.getState().setPlanStyle("easy");
    expect(useAppStore.getState().basketUndo).toBeNull();
  });

  it("可行 setPlan 写入 planStartedOn 并清 undo；null 与不可行清掉日期", () => {
    useAppStore.getState().applyBasketPreview(preview());
    useAppStore.getState().setPlan(samplePlan);
    expect(useAppStore.getState().planStartedOn).toBe(localYmd());
    expect(useAppStore.getState().basketUndo).toBeNull();
    useAppStore.getState().setPlan(null);
    expect(useAppStore.getState().planStartedOn).toBeNull();
    useAppStore.getState().setPlan(samplePlan);
    useAppStore.getState().setPlan(infeasible);
    expect(useAppStore.getState().planStartedOn).toBeNull();
  });

  it("改货架会清 plan", () => {
    useAppStore.getState().setPlan(samplePlan);
    expect(useAppStore.getState().plan).toEqual(samplePlan);
    useAppStore.getState().toggleBasketId("banana");
    expect(useAppStore.getState().plan).toBeNull();
    expect(useAppStore.getState().planStartedOn).toBeNull();

    useAppStore.getState().applyBasketPreview(preview());
    const ids = [...useAppStore.getState().basketIds];
    useAppStore.getState().patchPlan(samplePlan);
    expect(useAppStore.getState().basketUndo).not.toBeNull();
    expect(useAppStore.getState().plan).toEqual(samplePlan);
    useAppStore.getState().setBasketIds(ids);
    expect(useAppStore.getState().plan).toEqual(samplePlan);
    expect(useAppStore.getState().basketUndo).not.toBeNull();
    expect(useAppStore.getState().basketIds).toEqual(ids);
  });

  it("patchPlan 不重印开始日；setDays/setPlanStyle 会清掉旧 plan", () => {
    useAppStore.getState().setPlan(samplePlan);
    const started = useAppStore.getState().planStartedOn;
    useAppStore.getState().patchPlan({
      ...samplePlan,
      meals: [{ day: 0, slot: "dinner", recipeId: recipes[0].id }],
    });
    expect(useAppStore.getState().planStartedOn).toBe(started);
    useAppStore.getState().setDays(5);
    expect(useAppStore.getState().plan).toBeNull();
    expect(useAppStore.getState().planStartedOn).toBeNull();
    useAppStore.getState().setPlan(samplePlan);
    useAppStore.getState().setPlanStyle("variety");
    expect(useAppStore.getState().plan).toBeNull();
  });

  it("失败预览不写篮、style、days、plan", () => {
    useAppStore.getState().setBasketIds(["egg"]);
    useAppStore.getState().setPlanStyle("easy");
    useAppStore.getState().setDays(3);
    useAppStore.getState().setPlan(samplePlan);
    const started = useAppStore.getState().planStartedOn;
    useAppStore.getState().applyBasketPreview(preview({ ok: false, ids: ["x"] }));
    expect(useAppStore.getState().basketIds).toEqual(["egg"]);
    expect(useAppStore.getState().planStyle).toBe("easy");
    expect(useAppStore.getState().days).toBe(3);
    expect(useAppStore.getState().plan).toEqual(samplePlan);
    expect(useAppStore.getState().planStartedOn).toBe(started);
    expect(useAppStore.getState().basketUndo).toBeNull();
  });

  it("v4 快照经 persist rehydrate 升到 v6", async () => {
    const blob = {
      state: {
        profile: T1,
        basketIds: [...DEFAULT_BASKET_IDS],
        days: 7,
        plan: samplePlan,
        shoppingChecked: { banana: true, oats: true },
        progressStep: 2,
        cookProgress: { "0-lunch": { done: true } },
      },
      version: 4,
    };
    localStorage.setItem("aislemeal:v1", JSON.stringify(blob));
    await useAppStore.persist.rehydrate();
    expect(useAppStore.getState().planStyle).toBe("easy");
    expect(useAppStore.getState().planStartedOn).toBe(localYmd());
    expect(useAppStore.getState().profile).toEqual(T1_COERCED);
    expect(useAppStore.getState().days).toBe(7);
    expect(useAppStore.getState().plan).toEqual(samplePlan);
    expect(useAppStore.getState().basketIds).toEqual(
      commonKitchenIds(),
    );
    expect(useAppStore.getState().shoppingLists).toHaveLength(1);
    expect(useAppStore.getState().shoppingLists[0].status).toBe("active");
    expect(
      useAppStore
        .getState()
        .shoppingLists[0].items.find((item) => item.ingredientId === "banana")
        ?.checked,
    ).toBe(true);
    expect(
      useAppStore
        .getState()
        .shoppingLists[0].items.find((item) => item.ingredientId === "oats")
        ?.checked,
    ).toBe(true);
    expect(
      Object.prototype.hasOwnProperty.call(
        useAppStore.getState(),
        "shoppingChecked",
      ),
    ).toBe(false);
    expect(
      (useAppStore.getState() as { cookProgress?: unknown }).cookProgress,
    ).toBeUndefined();
  });

  it("recomputeMicro 按餐谱宏量重算微调，不叠在旧 dailyActual 上", () => {
    useAppStore.getState().setPlan({
      ...samplePlan,
      dailyActual: [{ kcal: 9999, protein: 1, fat: 1, carb: 1 }],
      microAdjust: [
        { day: 0, ingredientId: "banana", grams: 80, reason: "旧" },
      ],
    });
    useAppStore.getState().setProfile(T1, { recomputeMicro: true });
    const plan = useAppStore.getState().plan;
    expect(plan?.feasible).toBe(true);
    if (!plan || plan.feasible !== true) throw new Error("expected plan");
    expect(plan.dailyActual[0].kcal).not.toBe(9999);
    expect(plan.microAdjust.every((item) => item.reason !== "旧")).toBe(true);
  });

  it("setProfile 默认留 plan；resetPlan 清空餐单但保留清单", () => {
    useAppStore.getState().setPlan(samplePlan);
    useAppStore.getState().toggleListItemChecked("egg");
    const lists = useAppStore.getState().shoppingLists;
    useAppStore.getState().setProfile({
      ...T1,
      equipment: ["microwave"],
    });
    expect(useAppStore.getState().profile?.equipment).toEqual(["microwave"]);
    expect(useAppStore.getState().plan).toEqual(samplePlan);
    expect(useAppStore.getState().shoppingLists).toEqual(lists);
    useAppStore.getState().setProfile(T1, { resetPlan: true });
    expect(useAppStore.getState().profile).toEqual(T1_COERCED);
    expect(useAppStore.getState().plan).toBeNull();
    const after = useAppStore.getState().shoppingLists;
    expect(after).toHaveLength(lists.length);
    expect(after[0].stale).toBe(true);
    expect(after[0].items).toEqual(lists[0].items);
  });

  it("setPlan 可同时写入 planStyle", () => {
    useAppStore.getState().setPlan(samplePlan, { planStyle: "variety" });
    expect(useAppStore.getState().planStyle).toBe("variety");
    expect(useAppStore.getState().planStartedOn).toBe(localYmd());
    expect(useAppStore.getState().plan).toEqual(samplePlan);
  });
});

function namedList(
  partial: Partial<NamedShoppingList> & Pick<NamedShoppingList, "id">,
): NamedShoppingList {
  return {
    name: "清单",
    status: "archived",
    stale: false,
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
    sourceId: "user-shelf",
    days: 3,
    planStartedOn: null,
    linkedMeals: [],
    linkedMicroAdjust: [],
    items: [],
    ...partial,
  };
}

describe("persist v6 named shopping lists", () => {
  it("空清单名回退日期默认；coercePlan 从 meals 重算 dailyActual", () => {
    expect(truncateListName("  ")).toMatch(/日清单$/);
    const coerced = coercePlan({
      feasible: true,
      days: 1,
      meals: [{ day: 0, slot: "lunch", recipeId: recipes[0].id }],
      dailyActual: [{ kcal: 99999, protein: 1, fat: 1, carb: 1 }],
    });
    expect(coerced?.feasible).toBe(true);
    if (coerced && coerced.feasible) {
      expect(coerced.dailyActual[0].kcal).not.toBe(99999);
      expect(coerced.dailyActual[0].kcal).toBeGreaterThan(0);
    }
  });

  beforeEach(() => {
    useAppStore.getState().resetAll();
  });

  it("v5 可行 plan + shoppingChecked 迁成一条 active 清单", () => {
    const next = migratePlan(
      {
        profile: T1,
        plan: samplePlan,
        pantry: [],
        days: 1,
        shoppingChecked: { banana: true, oats: true },
        planStartedOn: "2026-08-20",
      },
      5,
      known,
    );
    expect(next.scopeMode).toBe("catalog");
    expect(next.wantedRecipeIds).toEqual([]);
    expect(next.shoppingLists).toHaveLength(1);
    const list = next.shoppingLists![0];
    expect(list.status).toBe("active");
    expect(next.activeShoppingListId).toBe(list.id);
    expect(list.stale).toBe(false);
    expect(list.items.length).toBeGreaterThan(0);
    expect(list.items.find((item) => item.ingredientId === "oats")?.checked).toBe(
      true,
    );
    const banana = list.items.find((item) => item.ingredientId === "banana");
    expect(banana).toBeTruthy();
    expect(banana!.checked).toBe(true);
    expect(
      Object.prototype.hasOwnProperty.call(next, "shoppingChecked"),
    ).toBe(false);
  });

  it("v5 无 plan 丢掉孤立 shoppingChecked", () => {
    const next = migratePlan(
      {
        plan: null,
        shoppingChecked: { egg: true, banana: true },
      },
      5,
      known,
    );
    expect(next.shoppingLists).toEqual([]);
    expect(next.activeShoppingListId).toBeNull();
    expect(
      Object.prototype.hasOwnProperty.call(next, "shoppingChecked"),
    ).toBe(false);
  });

  it("v4→6 不带回 cookProgress；coerce 丢掉坏行、多 active 收成 1", () => {
    const next = migratePlan(
      {
        plan: samplePlan,
        cookProgress: { "0-lunch": { done: true } },
      } as Parameters<typeof migratePlan>[0] & { cookProgress: unknown },
      4,
      known,
    );
    expect(Object.prototype.hasOwnProperty.call(next, "cookProgress")).toBe(
      false,
    );
    expect(next.shoppingLists).toHaveLength(1);

    const coerced = coerceNamedShoppingLists(
      [
        namedList({
          id: "sl-a",
          status: "active",
          updatedAt: "2026-08-19T00:00:00.000Z",
          items: [
            {
              ingredientId: "egg",
              needGrams: 60,
              packs: 1,
              packGrams: 60,
              surplusGrams: 0,
              checked: true,
            },
            { ingredientId: "bad", needGrams: Number.NaN } as never,
          ],
        }),
        namedList({
          id: "sl-b",
          status: "active",
          updatedAt: "2026-08-20T00:00:00.000Z",
          items: [
            {
              ingredientId: "banana",
              needGrams: 80,
              packs: 1,
              packGrams: 80,
              surplusGrams: 0,
              checked: false,
            },
          ],
        }),
        { name: "no-id", items: [] },
      ],
      "sl-a",
    );
    expect(coerced.shoppingLists).toHaveLength(2);
    expect(coerced.activeShoppingListId).toBe("sl-a");
    expect(coerced.shoppingLists.map((list) => list.status)).toEqual([
      "archived",
      "active",
    ]);
    const active = coerced.shoppingLists.find((list) => list.id === "sl-a");
    expect(active?.items.map((item) => item.ingredientId)).toEqual(["egg"]);
    const missingActive = coerceNamedShoppingLists(
      [namedList({ id: "sl-a", status: "active" })],
      "ghost",
    );
    expect(missingActive.activeShoppingListId).toBeNull();
    expect(missingActive.shoppingLists.every((list) => list.status === "archived")).toBe(
      true,
    );
    expect(coerceNamedShoppingLists(null, "x")).toEqual({
      shoppingLists: [],
      activeShoppingListId: null,
    });
  });

  it("shoppingListsToChecked 往返 active 勾选", () => {
    const lists = [
      namedList({
        id: "sl-1",
        status: "active",
        items: [
          {
            ingredientId: "egg",
            needGrams: 60,
            packs: 1,
            packGrams: 60,
            surplusGrams: 0,
            checked: true,
          },
          {
            ingredientId: "banana",
            needGrams: 80,
            packs: 1,
            packGrams: 80,
            surplusGrams: 0,
            checked: false,
          },
        ],
      }),
    ];
    expect(shoppingListsToChecked(lists, "sl-1")).toEqual({ egg: true });
    expect(shoppingListsToChecked(lists, null)).toEqual({});
  });

  it("具名清单勾选 persist 往返仍在", async () => {
    useAppStore.getState().setPlan(samplePlan);
    useAppStore.getState().commitShoppingSnapshot();
    const firstId = getActiveShoppingList(useAppStore.getState())!.items[0]
      .ingredientId;
    useAppStore.getState().toggleListItemChecked(firstId);
    expect(
      isShoppingItemChecked(
        getActiveShoppingList(useAppStore.getState()),
        firstId,
      ),
    ).toBe(true);
    const raw = localStorage.getItem("aislemeal:v1");
    expect(raw).toBeTruthy();
    expect(raw).not.toMatch(/listUndo/);
    useAppStore.getState().resetAll();
    localStorage.setItem("aislemeal:v1", raw!);
    await useAppStore.persist.rehydrate();
    const list = getActiveShoppingList(useAppStore.getState());
    expect(isShoppingItemChecked(list, firstId)).toBe(true);
    expect(useAppStore.getState().listUndo).toBeNull();
  });

  it("commitShoppingSnapshot 无 active 时写入快照 items", () => {
    useAppStore.getState().setPlan(samplePlan);
    useAppStore.getState().commitShoppingSnapshot();
    const list = getActiveShoppingList(useAppStore.getState());
    expect(list).toBeTruthy();
    expect(list?.stale).toBe(false);
    expect(list?.items.length).toBeGreaterThan(0);
    expect(list?.linkedMeals).toEqual(samplePlan.meals);
  });

  it("第 9 份清单必须确认，commit 不静默丢掉旧单", () => {
    for (let i = 0; i < 8; i += 1) {
      useAppStore.getState().setPlan(samplePlan);
      expect(useAppStore.getState().commitShoppingSnapshot()).toBe(true);
      useAppStore.getState().archiveActiveList();
    }
    expect(useAppStore.getState().shoppingLists).toHaveLength(8);
    useAppStore.getState().setPlan(samplePlan);
    expect(useAppStore.getState().commitShoppingSnapshot("overwrite")).toBe(
      false,
    );
    expect(useAppStore.getState().shoppingLists).toHaveLength(8);
    useAppStore.getState().dropOldestShoppingList();
    expect(useAppStore.getState().commitShoppingSnapshot("saveAs")).toBe(true);
    expect(useAppStore.getState().shoppingLists).toHaveLength(8);
  });

  it("骨架勾选在 setPlan 后仍在，仅 stale", () => {
    expect(useAppStore.getState().activeShoppingListId).toBeNull();
    useAppStore.getState().toggleListItemChecked("egg");
    const first = getActiveShoppingList(useAppStore.getState());
    expect(first).toBeTruthy();
    expect(first?.items).toEqual([
      expect.objectContaining({
        ingredientId: "egg",
        needGrams: 0,
        checked: true,
      }),
    ]);
    useAppStore.getState().setPlan(samplePlan);
    const after = getActiveShoppingList(useAppStore.getState());
    expect(after?.items).toHaveLength(1);
    expect(after?.items[0].ingredientId).toBe("egg");
    expect(after?.items[0].checked).toBe(true);
    expect(after?.stale).toBe(true);
  });

  it("setPlan 标 stale 不清其它清单 checked；覆盖保留同行勾选", () => {
    useAppStore.getState().setPlan(samplePlan);
    useAppStore.getState().commitShoppingSnapshot();
    const firstId = getActiveShoppingList(useAppStore.getState())!.items[0]
      .ingredientId;
    useAppStore.getState().toggleListItemChecked(firstId);
    expect(
      isShoppingItemChecked(
        getActiveShoppingList(useAppStore.getState()),
        firstId,
      ),
    ).toBe(true);
    useAppStore.getState().setPlan({
      ...samplePlan,
      meals: [{ day: 0, slot: "dinner", recipeId: recipes[0].id }],
    });
    const stale = getActiveShoppingList(useAppStore.getState());
    expect(stale?.stale).toBe(true);
    expect(isShoppingItemChecked(stale, firstId)).toBe(true);
    useAppStore.getState().setPlan(samplePlan);
    useAppStore.getState().commitShoppingSnapshot("overwrite");
    const covered = getActiveShoppingList(useAppStore.getState());
    expect(covered?.stale).toBe(false);
    expect(isShoppingItemChecked(covered, firstId)).toBe(true);
  });
});

describe("persist v7 enabledSlots", () => {
  it("v6 无 enabledSlots 与空数组都 coerce 成三餐", () => {
    const missing = migratePlan({ profile: T1 }, 6, known);
    expect(missing.profile?.enabledSlots).toEqual([...THREE_MEALS]);
    const empty = coerceProfile({ ...T1, enabledSlots: [] });
    expect(empty?.enabledSlots).toEqual([...THREE_MEALS]);
  });

  it("非法槽过滤；absences 只留 disabled；≥2 槽 awayKcal 夹 0..full", () => {
    const profile = coerceProfile({
      ...T1,
      enabledSlots: ["dinner", "snack", "breakfast"],
      slotAbsences: {
        dinner: { policy: "fold" },
        lunch: { policy: "reserve", awayKcal: 99999 },
      },
    });
    expect(profile?.enabledSlots).toEqual(["breakfast", "dinner"]);
    expect(profile?.slotAbsences?.dinner).toBeUndefined();
    expect(profile?.slotAbsences?.lunch?.policy).toBe("reserve");
    expect(profile?.slotAbsences?.lunch?.awayKcal).toBe(2040);
    const zero = coerceProfile({
      ...T1,
      enabledSlots: ["breakfast", "dinner"],
      slotAbsences: { lunch: { policy: "reserve", awayKcal: 0 } },
    });
    expect(zero?.slotAbsences?.lunch?.awayKcal).toBe(0);
  });

  it("单槽 awayKcal=0 coerce 后预算仍用默认份额", () => {
    const profile = coerceProfile({
      ...T1,
      enabledSlots: ["dinner"],
      slotAbsences: {
        breakfast: { policy: "reserve", awayKcal: 0 },
        lunch: { policy: "reserve" },
      },
    });
    expect(profile).toBeTruthy();
    if (!profile) throw new Error("expected profile");
    const full = computeTarget(profile);
    const remaining = remainingTarget(full, planSlotBudget(full, profile));
    expect(remaining.kcal).toBe(714);
    expect(remaining.kcal).not.toBe(1224);
    expect(profile.slotAbsences?.breakfast?.awayKcal).toBe(510);
  });

  it("单槽 awayKcal 极大或负数夹到 1..full，remaining 用夹紧值", () => {
    const huge = coerceProfile({
      ...T1,
      enabledSlots: ["dinner"],
      slotAbsences: {
        breakfast: { policy: "reserve", awayKcal: 99999 },
        lunch: { policy: "reserve" },
      },
    });
    expect(huge).toBeTruthy();
    if (!huge) throw new Error("expected profile");
    const fullHuge = computeTarget(huge);
    expect(huge.slotAbsences?.breakfast?.awayKcal).toBe(fullHuge.kcal);
    expect(huge.slotAbsences?.breakfast?.awayKcal).toBeGreaterThanOrEqual(1);
    const remainingHuge = remainingTarget(
      fullHuge,
      planSlotBudget(fullHuge, huge),
    );
    expect(remainingHuge.kcal).toBe(0);

    const neg = coerceProfile({
      ...T1,
      enabledSlots: ["dinner"],
      slotAbsences: {
        breakfast: { policy: "reserve", awayKcal: -10 },
        lunch: { policy: "reserve" },
      },
    });
    expect(neg).toBeTruthy();
    if (!neg) throw new Error("expected profile");
    const fullNeg = computeTarget(neg);
    expect(neg.slotAbsences?.breakfast?.awayKcal).toBe(1);
    expect(neg.slotAbsences?.breakfast?.awayKcal).toBeLessThanOrEqual(
      fullNeg.kcal,
    );
    const remainingNeg = remainingTarget(fullNeg, planSlotBudget(fullNeg, neg));
    expect(remainingNeg.kcal).toBe(fullNeg.kcal - 1 - 816);
  });

  it("任一未知 recipeId → plan=null", () => {
    const next = migratePlan(
      {
        plan: {
          ...samplePlan,
          meals: [
            { day: 0, slot: "lunch", recipeId: recipes[0].id },
            { day: 0, slot: "dinner", recipeId: "ghost-recipe" },
          ],
        },
      },
      7,
      known,
    );
    expect(next.plan).toBeNull();
  });

  it("清单 items 与 basketIds 丢未知 ingredient", () => {
    const next = migratePlan(
      {
        basketIds: ["egg", "not-a-real-sku"],
        shoppingLists: [
          namedList({
            id: "sl-1",
            status: "active",
            items: [
              {
                ingredientId: "egg",
                needGrams: 60,
                packs: 1,
                packGrams: 60,
                surplusGrams: 0,
                checked: false,
              },
              {
                ingredientId: "not-a-real-sku",
                needGrams: 10,
                packs: 1,
                packGrams: 10,
                surplusGrams: 0,
                checked: false,
              },
            ],
          }),
        ],
        activeShoppingListId: "sl-1",
      },
      7,
      known,
    );
    expect(next.basketIds).toEqual(commonKitchenIds());
    expect(next.shoppingLists?.[0].items.map((item) => item.ingredientId)).toEqual(
      ["egg"],
    );
  });

  it("源码 persist version 8，键名仍 aislemeal:v1", () => {
    const src = readFileSync(
      fileURLToPath(new URL("./useAppStore.ts", import.meta.url)),
      "utf8",
    );
    expect(src).toMatch(/name: "aislemeal:v1"/);
    expect(src).toMatch(/version: 8/);
  });

  it("v<8 catalog 迁成常见厨房；basket 模式保留已选", () => {
    const catalog = migratePlan(
      { basketIds: ["egg"], scopeMode: "catalog" },
      7,
      known,
    );
    expect(catalog.basketIds).toEqual(commonKitchenIds());
    const basket = migratePlan(
      { basketIds: ["egg", "broccoli"], scopeMode: "basket" },
      7,
      known,
    );
    expect(basket.basketIds).toEqual(["egg", "broccoli"]);
  });
});

describe("0.4.1 basket sanitize + persist reset", () => {
  beforeEach(() => {
    useAppStore.getState().resetAll();
    consumePersistResetNotice();
  });

  it("resetAll 后新用户食材为空，不预勾常见厨房", () => {
    useAppStore.getState().setBasketIds(["egg"]);
    useAppStore.getState().resetAll();
    expect(useAppStore.getState().basketIds).toEqual([]);
  });

  it("setProfile 角色 3 清洗已选食材，不含蛋奶鸡胸", () => {
    useAppStore.getState().setBasketIds(commonKitchenIds());
    expect(useAppStore.getState().basketIds).toEqual(
      expect.arrayContaining(["egg", "greek-yogurt", "chicken-breast", "oats"]),
    );
    useAppStore.getState().setProfile({
      sex: "female",
      age: 30,
      heightCm: 165,
      weightKg: 58,
      activity: "light",
      goal: "maintain",
      equipment: ["ricecooker", "airfryer", "microwave", "stove"],
      allergens: ["egg", "milk"],
      excludedIngredientIds: ["chicken-breast"],
    });
    const ids = useAppStore.getState().basketIds;
    expect(ids).not.toContain("egg");
    expect(ids).not.toContain("greek-yogurt");
    expect(ids).not.toContain("chicken-breast");
    expect(ids).toContain("oats");
  });

  it("手勾过敏原后 rehydrate 仍洗掉", async () => {
    useAppStore.getState().setProfile({
      ...T1,
      allergens: ["egg"],
    });
    useAppStore.getState().toggleBasketId("egg");
    expect(useAppStore.getState().basketIds).toContain("egg");
    const raw = localStorage.getItem("aislemeal:v1");
    expect(raw).toBeTruthy();
    useAppStore.getState().resetAll();
    localStorage.setItem("aislemeal:v1", raw!);
    await useAppStore.persist.rehydrate();
    expect(useAppStore.getState().basketIds).not.toContain("egg");
  });

  it("坏 JSON persist 标记重置", async () => {
    localStorage.setItem("aislemeal:v1", "{not-json");
    await useAppStore.persist.rehydrate();
    expect(persistHadReset()).toBe(true);
    expect(consumePersistResetNotice()).toBe("parse");
    expect(useAppStore.getState().profile).toBeNull();
  });

  it("空清单不算已买完", () => {
    expect(
      shoppingListBought(
        namedList({ id: "sl-empty", items: [] }),
        () => "protein",
      ),
    ).toBe(false);
  });

  it("合法 JSON 但 sex 非法时档案和餐单清空", async () => {
    const blob = {
      state: {
        profile: { ...T1, sex: "??" },
        basketIds: [...DEFAULT_BASKET_IDS],
        days: 3,
        plan: samplePlan,
      },
      version: 7,
    };
    localStorage.setItem("aislemeal:v1", JSON.stringify(blob));
    await useAppStore.persist.rehydrate();
    expect(useAppStore.getState().profile).toBeNull();
    expect(useAppStore.getState().plan).toBeNull();
    expect(persistHadReset()).toBe(true);
    expect(consumePersistResetNotice()).toBe("profile");
  });
});
