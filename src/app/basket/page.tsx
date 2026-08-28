"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DialogSheet } from "@/components/DialogSheet";
import {
  BasketOutcomeSummary,
  infeasibleCtaLabel,
} from "@/components/BasketOutcomeSummary";
import { EmptyState } from "@/components/EmptyState";
import { IngredientStatusBadge } from "@/components/IngredientStatusBadge";
import { PageShell } from "@/components/PageShell";
import { PlanStyleSelector } from "@/components/PlanStyleSelector";
import { DaysPicker } from "@/components/DaysPicker";
import { RecommendationPreview } from "@/components/RecommendationPreview";
import { StoreSourceBanner } from "@/components/StoreSourceBanner";
import {
  BASKET_UI_GROUP_LABEL,
  BASKET_UI_GROUPS,
  basketUiGroup,
  isPantryOrphan,
  pantryUniverse,
  recipeReferencedIds,
} from "@/domain/basketGrid";
import { computeBasketFeedback } from "@/domain/basketFeedback";
import { ingredients, recipes } from "@/domain/data";
import { shortNameOf } from "@/domain/displayName";
import { enabledSlotsOf } from "@/domain/nutrition";
import { eligibleRecipes, summarizePlanDiversity } from "@/domain/planner";
import { isProcessedMeat, previewHealthyBaskets } from "@/domain/recommend";
import { commonKitchenIds } from "@/domain/shelf";
import { buildShoppingList, flattenShoppingList } from "@/domain/shoppingList";
import type { Category, CustomIngredient, Ingredient, PlanStyle } from "@/domain/types";
import { CATEGORY_LABEL } from "@/lib/labels";
import { useAppStore } from "@/store/useAppStore";

const CATEGORIES: Category[] = ["protein", "carb", "veg", "fat", "seasoning"];
const RECIPE_IDS = recipeReferencedIds(recipes);

function CustomAddSheet({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (item: CustomIngredient) => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Category>("veg");
  const [nutritionId, setNutritionId] = useState("egg");
  const [equate, setEquate] = useState(false);
  const options = useMemo(
    () =>
      [...ingredients].sort((a, b) => {
        if (a.popularity !== b.popularity) return a.popularity - b.popularity;
        return shortNameOf(a).localeCompare(shortNameOf(b), "zh");
      }),
    [],
  );
  const base = ingredients.find((item) => item.id === nutritionId);

  function submit() {
    const trimmed = name.trim();
    if (!trimmed || !base) return;
    onAdd({
      id: `user-${Date.now().toString(36)}`,
      name: trimmed.slice(0, 40),
      category,
      pack: { ...base.pack },
      per100g: { ...base.per100g },
      ...(base.allergens && base.allergens.length > 0
        ? { allergens: [...base.allergens] }
        : {}),
      ...(equate ? { similarToId: base.id } : {}),
    });
    onClose();
  }

  return (
    <DialogSheet title="添加其他食材" titleId="custom-add-title" onClose={onClose}>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        <label className="block text-sm text-[var(--color-text-2)]">
          名称
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full min-h-11 rounded-xl border px-3 text-base text-[var(--color-text)]"
            style={{ borderColor: "var(--color-line)" }}
          />
        </label>
        <label className="block text-sm text-[var(--color-text-2)]">
          分类
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
            className="mt-1 w-full min-h-11 rounded-xl border bg-[var(--color-surface)] px-3 text-base text-[var(--color-text)]"
            style={{ borderColor: "var(--color-line)" }}
          >
            {CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {CATEGORY_LABEL[item]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm text-[var(--color-text-2)]">
          营养近似（必选，复制热量蛋白）
          <select
            value={nutritionId}
            onChange={(e) => setNutritionId(e.target.value)}
            className="mt-1 w-full min-h-11 rounded-xl border bg-[var(--color-surface)] px-3 text-base text-[var(--color-text)]"
            style={{ borderColor: "var(--color-line)" }}
          >
            {options.map((item) => (
              <option key={item.id} value={item.id}>
                {shortNameOf(item)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm text-[var(--color-text)]">
          <input
            type="checkbox"
            className="accent-[var(--color-brand)]"
            checked={equate}
            onChange={(e) => setEquate(e.target.checked)}
          />
          等同于该食材（才能解锁对应菜）
        </label>
        {!equate ? (
          <p className="text-xs text-[var(--color-warn)]">
            不勾「等同于」时只出现在食材列表，不会解锁新菜。
          </p>
        ) : null}
        {base ? (
          <p className="text-xs text-[var(--color-text-3)]">
            包装按 {base.pack.label} · {base.pack.size}
            {base.pack.unit}；禁止手填营养数字。
          </p>
        ) : null}
      </div>
      <div className="flex gap-2 border-t px-4 py-3" style={{ borderColor: "var(--color-line)" }}>
        <button
          type="button"
          onClick={onClose}
          className="min-h-12 flex-1 rounded-xl bg-[var(--color-surface-2)] text-sm"
        >
          取消
        </button>
        <button
          type="button"
          disabled={!name.trim() || !base}
          onClick={submit}
          className="min-h-12 flex-1 rounded-xl bg-[var(--color-brand)] text-sm text-white disabled:bg-[var(--color-surface-2)] disabled:text-[var(--color-text-3)]"
        >
          添加
        </button>
      </div>
    </DialogSheet>
  );
}

function IngredientTile({
  item,
  checked,
  onToggle,
}: {
  item: Ingredient;
  checked: boolean;
  onToggle: () => void;
}) {
  const short = shortNameOf(item);
  const noRecipe = !RECIPE_IDS.has(item.id);
  return (
    <label
      className="min-h-11 rounded-xl border p-2"
      style={{
        borderColor: checked ? "var(--color-brand)" : "var(--color-line)",
        background: checked ? "var(--color-surface-2)" : "var(--color-surface)",
      }}
    >
      <span className="flex items-start gap-1.5">
        <input
          type="checkbox"
          className="mt-0.5 accent-[var(--color-brand)]"
          checked={checked}
          onChange={onToggle}
        />
        <span>
          <span className="block text-sm font-medium text-[var(--color-text)]">
            {short}
          </span>
          <span className="mt-0.5 block text-xs text-[var(--color-text-3)]">
            {item.pack.label}
          </span>
          {noRecipe ? <IngredientStatusBadge kind="no-recipe" /> : null}
          {isProcessedMeat(item) ? (
            <IngredientStatusBadge kind="processed" />
          ) : null}
        </span>
      </span>
    </label>
  );
}

export default function BasketPage() {
  return (
    <PageShell title="我的食材">
      <BasketBody />
    </PageShell>
  );
}

function BasketBody() {
  const router = useRouter();
  const profile = useAppStore((s) => s.profile);
  const pantry = useAppStore((s) => s.pantry);
  const setPantry = useAppStore((s) => s.setPantry);
  const basketIds = useAppStore((s) => s.basketIds);
  const setBasketIds = useAppStore((s) => s.setBasketIds);
  const toggleBasketId = useAppStore((s) => s.toggleBasketId);
  const customIngredients = useAppStore((s) => s.customIngredients);
  const addCustomIngredient = useAppStore((s) => s.addCustomIngredient);
  const removeCustomIngredient = useAppStore((s) => s.removeCustomIngredient);
  const days = useAppStore((s) => s.days);
  const setDays = useAppStore((s) => s.setDays);
  const planStyle = useAppStore((s) => s.planStyle);
  const setPlanStyle = useAppStore((s) => s.setPlanStyle);
  const plan = useAppStore((s) => s.plan);
  const setPlan = useAppStore((s) => s.setPlan);
  const setProgressStep = useAppStore((s) => s.setProgressStep);
  const applyBasketPreview = useAppStore((s) => s.applyBasketPreview);
  const undoBasketPreview = useAppStore((s) => s.undoBasketPreview);
  const basketUndo = useAppStore((s) => s.basketUndo);

  const [pantryOpen, setPantryOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [pantryQuery, setPantryQuery] = useState("");
  const [query, setQuery] = useState("");
  const [seasoningOpen, setSeasoningOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = q
      ? ingredients.filter((item) => {
          const short = shortNameOf(item).toLowerCase();
          return (
            item.name.toLowerCase().includes(q) ||
            short.includes(q) ||
            item.id.includes(q)
          );
        })
      : ingredients;
    return BASKET_UI_GROUPS.map((group) => ({
      group,
      items: pool
        .filter((item) => basketUiGroup(item) === group)
        .sort((a, b) => {
          if (a.popularity !== b.popularity) return a.popularity - b.popularity;
          return shortNameOf(a).localeCompare(shortNameOf(b), "zh");
        }),
    }));
  }, [query]);

  const pantryUniverseIds = useMemo(
    () =>
      pantryUniverse(
        ingredients,
        recipes,
        pantry.map((item) => item.ingredientId),
      ),
    [pantry],
  );

  const pantryGrouped = useMemo(() => {
    const q = pantryQuery.trim().toLowerCase();
    const pool = ingredients.filter((item) => pantryUniverseIds.has(item.id));
    const matched = q
      ? pool.filter((item) => {
          const short = shortNameOf(item).toLowerCase();
          return (
            item.name.toLowerCase().includes(q) ||
            short.includes(q) ||
            item.id.includes(q)
          );
        })
      : pool;
    return CATEGORIES.map((category) => ({
      category,
      items: matched
        .filter((item) => item.category === category)
        .sort((a, b) => {
          const aOn = a.id in draft ? 0 : 1;
          const bOn = b.id in draft ? 0 : 1;
          if (aOn !== bOn) return aOn - bOn;
          return a.id.localeCompare(b.id);
        }),
    }));
  }, [pantryUniverseIds, pantryQuery, draft]);

  const feedback = useMemo(() => {
    if (!profile) return null;
    return computeBasketFeedback(
      basketIds,
      profile,
      days,
      recipes,
      ingredients,
      planStyle,
    );
  }, [profile, basketIds, days, planStyle]);

  const selected = useMemo(() => new Set(basketIds), [basketIds]);
  const feasible = Boolean(feedback?.planPreview.feasible);
  const diversity =
    feedback?.planPreview.feasible === true
      ? summarizePlanDiversity(feedback.planPreview)
      : null;
  const coverage = useMemo(() => {
    if (!profile) return { breakfastCount: 0, mainsCount: 0 };
    const eligible = eligibleRecipes(recipes, profile, basketIds, ingredients);
    const breakfastCount = eligible.filter((recipe) =>
      recipe.mealSlots.includes("breakfast"),
    ).length;
    const mainsCount = new Set(
      eligible
        .filter(
          (recipe) =>
            recipe.mealSlots.includes("lunch") ||
            recipe.mealSlots.includes("dinner"),
        )
        .map((recipe) => recipe.id),
    ).size;
    return { breakfastCount, mainsCount };
  }, [profile, basketIds]);

  const currentPackCount = useMemo(() => {
    if (!feedback?.planPreview.feasible) return undefined;
    return flattenShoppingList(
      buildShoppingList(feedback.planPreview, pantry, ingredients, recipes, days),
    ).reduce((sum, line) => sum + line.packs, 0);
  }, [feedback, pantry, days]);

  const dualPreview = useMemo(() => {
    if (!profile || !previewOpen) return null;
    return previewHealthyBaskets({
      recipes,
      ingredients,
      profile,
      currentIds: basketIds,
      days,
      pantry,
    });
  }, [profile, previewOpen, basketIds, days, pantry]);

  function openPantry() {
    const next: Record<string, number> = {};
    for (const item of pantry) next[item.ingredientId] = item.grams;
    setDraft(next);
    setPantryQuery("");
    setPantryOpen(true);
  }

  function savePantry() {
    setPantry(
      Object.entries(draft)
        .filter(([, grams]) => Number.isFinite(grams) && grams > 0)
        .map(([ingredientId, grams]) => ({
          ingredientId,
          grams: Math.min(99999, grams),
        })),
    );
    setPantryOpen(false);
  }

  function toggleDraft(id: string, packSize: number) {
    setDraft((prev) => {
      if (id in prev) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      if (!pantryUniverseIds.has(id)) return prev;
      return { ...prev, [id]: packSize };
    });
  }

  function confirmWipeWeek(): boolean {
    if (!plan) return true;
    return window.confirm("将清空当前餐单");
  }

  function changeDays(next: number) {
    if (next === days) return;
    if (!confirmWipeWeek()) return;
    setDays(next);
  }

  function changeStyle(next: PlanStyle) {
    if (next === planStyle) return;
    if (!confirmWipeWeek()) return;
    setPlanStyle(next);
  }

  function confirmBasket() {
    if (!feedback?.planPreview.feasible) return;
    setPlan(feedback.planPreview);
    setProgressStep(3);
    router.push("/plan");
  }

  if (!profile) {
    return (
      <EmptyState
        title="还没有身体档案"
        description="先建档算出营养目标，再勾选手头有的食材。"
        href="/onboarding"
        action="去建档"
      />
    );
  }

  const selectedNames = [
    ...ingredients
      .filter((item) => selected.has(item.id))
      .map((item) => shortNameOf(item)),
    ...customIngredients.map((item) => item.name),
  ];

  return (
    <div
      className="pb-36"
      style={{ paddingBottom: "calc(8.5rem + env(safe-area-inset-bottom))" }}
    >
      <StoreSourceBanner />

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            if (!confirmWipeWeek()) return;
            setBasketIds(commonKitchenIds());
          }}
          className="min-h-11 rounded-xl border text-sm text-[var(--color-brand)]"
          style={{ borderColor: "var(--color-line)" }}
        >
          常见厨房预勾
        </button>
        <button
          type="button"
          onClick={() => {
            if (!confirmWipeWeek()) return;
            setBasketIds([]);
          }}
          className="min-h-11 rounded-xl border text-sm text-[var(--color-text)]"
          style={{ borderColor: "var(--color-line)" }}
        >
          全不选
        </button>
      </div>

      <div className="mt-3">
        <div className="mb-3">
          <DaysPicker value={days} onChange={changeDays} label="买几天" />
        </div>
        <PlanStyleSelector
          value={planStyle}
          onChange={changeStyle}
        />
      </div>

      {feedback ? (
        <div className="mt-3">
          <BasketOutcomeSummary
            breakfastCount={coverage.breakfastCount}
            mainsCount={coverage.mainsCount}
            diversity={diversity}
            style={planStyle}
            days={days}
            showBreakfast={
              !profile || enabledSlotsOf(profile).includes("breakfast")
            }
          />
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setPreviewOpen(true)}
        className="mt-3 min-h-12 w-full rounded-xl bg-[var(--color-brand)] text-base font-semibold text-white"
      >
        帮我配一篮
      </button>
      <button
        type="button"
        onClick={openPantry}
        className="mt-3 min-h-11 w-full rounded-xl border text-sm text-[var(--color-brand)]"
        style={{ borderColor: "var(--color-line)" }}
      >
        家里已有食材{pantry.length > 0 ? `（${pantry.length}）` : ""}
      </button>
      {basketUndo ? (
        <p className="mt-2 text-sm text-[var(--color-text-2)]" aria-live="polite">
          已换为{planStyle === "easy" ? "省事" : "换花样"}篮子
        </p>
      ) : null}
      {basketUndo ? (
        <button
          type="button"
          onClick={undoBasketPreview}
          className="mt-2 min-h-11 w-full text-sm text-[var(--color-brand)]"
        >
          撤销刚才的推荐篮
        </button>
      ) : null}

      <p className="mt-3 text-sm text-[var(--color-text-2)]">
        已选 {basketIds.length + customIngredients.length} 样
        {selectedNames.length > 0 ? `  ${selectedNames.slice(0, 8).join(" ")}` : ""}
      </p>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="搜索食材"
        className="mt-3 w-full min-w-0 rounded-xl border bg-[var(--color-surface)] px-3 py-3 text-base"
        style={{ borderColor: "var(--color-line)" }}
      />

      <p className="mt-2 text-center">
        <Link
          href="/recipes"
          className="inline-flex min-h-11 items-center text-base text-[var(--color-text-2)]"
        >
          去灵感看看
        </Link>
      </p>

      {grouped.map(({ group, items }) => {
        if (items.length === 0) return null;
        const collapsed = group === "seasoning" && !seasoningOpen && !query;
        return (
          <section key={group} className="mt-4">
            {group === "seasoning" ? (
              <button
                type="button"
                onClick={() => setSeasoningOpen((v) => !v)}
                className="mb-2 flex min-h-11 w-full items-center justify-between text-left"
              >
                <h2 className="text-base font-semibold text-[var(--color-text)]">
                  {BASKET_UI_GROUP_LABEL[group]}
                </h2>
                <span className="text-xs text-[var(--color-text-2)]">
                  {seasoningOpen || query
                    ? "收起"
                    : "排餐已默认有调味，要买再展开"}
                </span>
              </button>
            ) : (
              <h2 className="mb-2 text-base font-semibold text-[var(--color-text)]">
                {BASKET_UI_GROUP_LABEL[group]}
              </h2>
            )}
            {collapsed ? null : (
              <div className="grid grid-cols-2 gap-2">
                {items.map((item) => (
                  <IngredientTile
                    key={item.id}
                    item={item}
                    checked={selected.has(item.id)}
                    onToggle={() => {
                      if (plan && !confirmWipeWeek()) return;
                      toggleBasketId(item.id);
                    }}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}

      <section className="mt-4">
        <h2 className="mb-2 text-base font-semibold text-[var(--color-text)]">
          其他
        </h2>
        {customIngredients.length === 0 ? (
          <p className="text-sm text-[var(--color-text-2)]">
            库里没有的，可以自定义添加。营养必须近似一种内置食材。
          </p>
        ) : (
          <ul className="space-y-2">
            {customIngredients.map((item) => (
              <li
                key={item.id}
                className="flex items-start justify-between gap-2 rounded-xl border px-3 py-2"
                style={{ borderColor: "var(--color-line)" }}
              >
                <span>
                  <span className="block text-sm font-medium text-[var(--color-text)]">
                    {item.name}
                  </span>
                  <span className="text-xs text-[var(--color-text-3)]">
                    {CATEGORY_LABEL[item.category]} · {item.pack.label}
                    {item.similarToId
                      ? " · 可参与排菜"
                      : " · 不会解锁新菜"}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (plan && !confirmWipeWeek()) return;
                    removeCustomIngredient(item.id);
                  }}
                  className="min-h-11 text-sm text-[var(--color-warn)]"
                >
                  删除
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={() => setCustomOpen(true)}
          className="mt-2 min-h-11 w-full rounded-xl border text-sm text-[var(--color-brand)]"
          style={{ borderColor: "var(--color-line)" }}
        >
          添加其他食材
        </button>
      </section>

      <div
        className="fixed inset-x-0 z-10 mx-auto max-w-md border-t bg-[var(--color-surface)]/95 px-4 py-3 backdrop-blur"
        style={{
          borderColor: "var(--color-line)",
          bottom: "calc(var(--bottom-nav) + env(safe-area-inset-bottom))",
        }}
      >
        {feedback ? (
          <BasketOutcomeSummary
            breakfastCount={coverage.breakfastCount}
            mainsCount={coverage.mainsCount}
            diversity={diversity}
            style={planStyle}
            days={days}
            showBreakfast={
              !profile || enabledSlotsOf(profile).includes("breakfast")
            }
          />
        ) : null}
        {feedback?.hint ? (
          <p className="mt-1 text-xs text-[var(--color-warn)]">{feedback.hint}</p>
        ) : (
          <p className="mt-1 text-xs text-[var(--color-text-2)]">
            {feasible ? "热量蛋白大致在目标内" : "见上方建议"}
          </p>
        )}
        <button
          type="button"
          disabled={!feasible}
          onClick={confirmBasket}
          className="mt-2 min-h-12 w-full rounded-xl bg-[var(--color-brand)] text-base font-semibold text-white disabled:bg-[var(--color-surface-2)] disabled:text-[var(--color-text-3)]"
        >
          {feedback ? infeasibleCtaLabel(feedback) : "用这篮生成餐单"}
        </button>
      </div>

      {previewOpen && dualPreview ? (
        <RecommendationPreview
          easy={dualPreview.easy}
          variety={dualPreview.variety}
          currentPackCount={currentPackCount}
          showBreakfast={
            !profile || enabledSlotsOf(profile).includes("breakfast")
          }
          onApply={(preview) => {
            applyBasketPreview(preview);
            setPreviewOpen(false);
          }}
          onCancel={() => setPreviewOpen(false)}
        />
      ) : null}

      {pantryOpen ? (
        <DialogSheet
          title="家里已有食材"
          titleId="pantry-title"
          onClose={() => setPantryOpen(false)}
        >
            <p className="px-4 pt-2 text-sm text-[var(--color-text-2)]">
              勾选并填写克数，生成清单时会扣除
            </p>
            <div className="px-4 pt-2">
              <input
                type="search"
                value={pantryQuery}
                onChange={(e) => setPantryQuery(e.target.value)}
                placeholder="搜索家里已有"
                className="w-full min-w-0 rounded-xl border bg-[var(--color-surface)] px-3 py-3 text-base"
                style={{ borderColor: "var(--color-line)" }}
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {pantryGrouped.map(({ category, items }) =>
                items.length === 0 ? null : (
                <section key={category} className="mb-3">
                  <h3 className="mb-1.5 text-xs font-semibold text-[var(--color-text-2)]">
                    {CATEGORY_LABEL[category]}
                  </h3>
                  <ul className="space-y-1.5">
                    {items.map((item) => {
                      const on = item.id in draft;
                      const orphan = isPantryOrphan(
                        item.id,
                        ingredients,
                        recipes,
                      );
                      return (
                        <li key={item.id}>
                          <div className="flex items-center gap-2">
                          <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              className="accent-[var(--color-brand)]"
                              checked={on}
                              onChange={() => toggleDraft(item.id, item.pack.size)}
                            />
                            <span className="truncate">{shortNameOf(item)}</span>
                          </label>
                          <input
                            type="number"
                            min={0}
                            inputMode="numeric"
                            disabled={!on}
                            value={on ? draft[item.id] ?? 0 : ""}
                            onChange={(e) => {
                              const raw = e.target.value;
                              const n = raw === "" ? 0 : Number(raw);
                              const grams = Number.isFinite(n)
                                ? Math.min(99999, Math.max(0, n))
                                : 0;
                              setDraft((prev) => ({
                                ...prev,
                                [item.id]: grams,
                              }));
                            }}
                            className="min-h-11 w-20 rounded-lg border px-2 py-1 text-right text-base disabled:bg-[var(--color-surface-2)]"
                            style={{ borderColor: "var(--color-line)" }}
                            aria-label={`${item.name}克数`}
                          />
                          <span className="w-4 text-xs text-[var(--color-text-3)]">g</span>
                          </div>
                          {orphan ? (
                            <p className="pl-6 text-xs text-[var(--color-text-3)]">
                              没有任何菜用到，保存后不再提供新加
                            </p>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
            <div className="flex gap-2 border-t px-4 py-3" style={{ borderColor: "var(--color-line)" }}>
              <button
                type="button"
                onClick={() => setPantryOpen(false)}
                className="min-h-12 flex-1 rounded-xl bg-[var(--color-surface-2)] text-sm"
              >
                取消
              </button>
              <button
                type="button"
                onClick={savePantry}
                className="min-h-12 flex-1 rounded-xl bg-[var(--color-brand)] text-sm text-white"
              >
                保存
              </button>
            </div>
        </DialogSheet>
      ) : null}

      {customOpen ? (
        <CustomAddSheet
          onClose={() => setCustomOpen(false)}
          onAdd={(item) => {
            if (plan && !confirmWipeWeek()) return;
            addCustomIngredient(item);
          }}
        />
      ) : null}
    </div>
  );
}
