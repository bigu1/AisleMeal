"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { RecipeCard } from "@/components/RecipeCard";
import { StoreSourceBanner } from "@/components/StoreSourceBanner";
import { resolveUniverse } from "@/domain/availability";
import { recipes, ingredients } from "@/domain/data";
import { recipeMacros } from "@/domain/nutrition";
import { cookableRecipes, recipeAllowedByProfile } from "@/domain/planner";
import {
  missingCookKind,
  missingCookLabel,
  missingNonSeasoningIds,
} from "@/domain/recommend";
import type { MealSlot } from "@/domain/types";
import { SLOT_LABEL } from "@/lib/labels";
import { useAppStore } from "@/store/useAppStore";

const SLOT_OPTIONS: MealSlot[] = ["breakfast", "lunch", "dinner"];
const REPLACE_RE = /^(\d+)-(breakfast|lunch|dinner)$/;

function toggleItem<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

function chipClass(active: boolean) {
  return `max-w-full min-h-11 rounded-xl px-3 text-sm ${
    active
      ? "bg-[var(--color-brand)] text-white"
      : "border bg-[var(--color-surface)] text-[var(--color-text)]"
  }`;
}

function Skeleton() {
  return (
    <div className="space-y-3">
      <div className="h-8 animate-pulse rounded-xl bg-[var(--color-surface-2)]" />
      <div className="h-40 animate-pulse rounded-2xl bg-[var(--color-surface-2)]" />
    </div>
  );
}

export default function RecipesPage() {
  return (
    <PageShell title="菜谱灵感">
      <Suspense fallback={<Skeleton />}>
        <RecipesReady />
      </Suspense>
    </PageShell>
  );
}

function parseReplace(
  raw: string | null,
  days: number | undefined,
): { day: number; slot: MealSlot } | undefined {
  if (!raw) return undefined;
  const match = REPLACE_RE.exec(raw);
  if (!match) return undefined;
  const day = Number(match[1]);
  if (!Number.isInteger(day) || days == null || day < 0 || day >= days) {
    return undefined;
  }
  return { day, slot: match[2] as MealSlot };
}

function RecipesReady() {
  const searchParams = useSearchParams();
  const profile = useAppStore((s) => s.profile);
  const basketIds = useAppStore((s) => s.basketIds);
  const customIngredients = useAppStore((s) => s.customIngredients);
  const wantedRecipeIds = useAppStore((s) => s.wantedRecipeIds);
  const toggleWanted = useAppStore((s) => s.toggleWanted);
  const plan = useAppStore((s) => s.plan);
  const universe = resolveUniverse(basketIds, customIngredients);
  const replace = parseReplace(
    searchParams.get("replace"),
    plan?.feasible === true ? plan.days : undefined,
  );
  const [slots, setSlots] = useState<MealSlot[]>([]);
  const [slotTouched, setSlotTouched] = useState(false);
  const [mineOnly, setMineOnly] = useState(true);
  const [cookableOnly, setCookableOnly] = useState(true);
  const [quickOnly, setQuickOnly] = useState(false);
  const [keyword, setKeyword] = useState("");
  const defaultSlot = !slotTouched ? replace?.slot : undefined;
  const slotFilter = defaultSlot ? [defaultSlot] : slots;

  const q = keyword.trim().toLowerCase();
  const filtered = recipes.filter((recipe) => {
    if (profile && !recipeAllowedByProfile(recipe, profile, ingredients)) {
      return false;
    }
    if (
      mineOnly &&
      profile &&
      !recipe.equipment.every((eq) => profile.equipment.includes(eq))
    ) {
      return false;
    }
    if (slotFilter.length > 0 && !slotFilter.some((slot) => recipe.mealSlots.includes(slot))) {
      return false;
    }
    if (quickOnly && recipe.timeMinutes > 15) return false;
    if (q && !recipe.name.toLowerCase().includes(q)) return false;
    if (
      cookableOnly &&
      missingNonSeasoningIds(recipe, universe, ingredients).length > 0
    ) {
      return false;
    }
    return true;
  });

  const byId = useMemo(() => new Map(ingredients.map((item) => [item.id, item])), []);
  const cookableIds = new Set(
    profile
      ? cookableRecipes(recipes, profile, ingredients, universe).map(
          (recipe) => recipe.id,
        )
      : [],
  );

  return (
    <div className="min-w-0 max-w-full space-y-3">
        {wantedRecipeIds.length > 0 ? (
          <Link
            href="/plan"
            className="flex min-h-12 items-center justify-center rounded-xl bg-[var(--color-brand)] text-base font-semibold text-white"
          >
            本周 {wantedRecipeIds.length} 道 · 去餐单排出
          </Link>
        ) : null}
        <p className="text-base text-[var(--color-text-2)]">
          {replace
            ? `正在替换第 ${replace.day + 1} 天${SLOT_LABEL[replace.slot]}。点选一道菜只会换这一餐。`
            : "看看这些食材还能怎么做，不会直接修改你的餐单。"}
        </p>
        <StoreSourceBanner />
        {universe.size === 0 ? (
          <p className="text-sm text-[var(--color-warn)]">
            先勾手头有的食材，再筛选可做的菜。{" "}
            <Link href="/basket" className="text-[var(--color-brand)]">
              去选食材
            </Link>
          </p>
        ) : null}

        <input
          type="search"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜索食谱名称"
          className="w-full min-w-0 rounded-xl border bg-[var(--color-surface)] px-3 py-3 text-base"
          style={{ borderColor: "var(--color-line)" }}
        />

        <fieldset>
          <legend className="mb-1.5 text-sm text-[var(--color-text-2)]">餐位</legend>
          <div className="flex flex-wrap gap-2">
            {SLOT_OPTIONS.map((slot) => (
              <button
                key={slot}
                type="button"
                onClick={() => {
                  setSlotTouched(true);
                  setSlots((cur) => {
                    const base = !slotTouched && replace ? [replace.slot] : cur;
                    return toggleItem(base, slot);
                  });
                }}
                className={chipClass(slotFilter.includes(slot))}
                style={
                  slotFilter.includes(slot)
                    ? undefined
                    : { borderColor: "var(--color-line)" }
                }
              >
                {SLOT_LABEL[slot]}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1.5 text-sm text-[var(--color-text-2)]">
            筛选
          </legend>
          {profile ? (
            <button
              type="button"
              onClick={() => setMineOnly((v) => !v)}
              className={chipClass(mineOnly)}
              style={mineOnly ? undefined : { borderColor: "var(--color-line)" }}
            >
              符合我的厨具
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setCookableOnly((v) => !v)}
            className={chipClass(cookableOnly)}
            style={cookableOnly ? undefined : { borderColor: "var(--color-line)" }}
          >
            我有的食材
          </button>
        </fieldset>

        <button
          type="button"
          onClick={() => setQuickOnly((v) => !v)}
          className={chipClass(quickOnly)}
          style={quickOnly ? undefined : { borderColor: "var(--color-line)" }}
        >
          ≤15 分钟
        </button>

        <p className="text-sm text-[var(--color-text-2)]">共 {filtered.length} 道</p>

        {filtered.length === 0 ? (
          <p
            className="rounded-2xl border border-dashed bg-[var(--color-surface)] p-6 text-center text-sm text-[var(--color-text-2)]"
            style={{ borderColor: "var(--color-line)" }}
          >
            没有符合条件的食谱，试试去掉筛选。
          </p>
        ) : (
          <ul className="space-y-2">
            {filtered.map((recipe) => (
              <li key={recipe.id} className="min-w-0">
                <RecipeCard
                  recipe={recipe}
                  macros={recipeMacros(recipe, byId)}
                  missingCount={
                    missingNonSeasoningIds(recipe, universe, ingredients)
                      .length
                  }
                  missingLabel={missingCookLabel(
                    missingCookKind(
                      missingNonSeasoningIds(recipe, universe, ingredients),
                      universe,
                    ),
                  )}
                  replace={replace}
                  wanted={wantedRecipeIds.includes(recipe.id)}
                  onToggleWanted={
                    replace
                      ? undefined
                      : () => toggleWanted(recipe.id)
                  }
                  joinDisabled={
                    !wantedRecipeIds.includes(recipe.id) &&
                    (profile
                      ? !cookableIds.has(recipe.id)
                      : missingNonSeasoningIds(
                          recipe,
                          universe,
                          ingredients,
                        ).length > 0)
                  }
                />
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
