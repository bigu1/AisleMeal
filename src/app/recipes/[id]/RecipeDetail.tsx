"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CookingVideoLink } from "@/components/CookingVideoLink";
import { PageShell } from "@/components/PageShell";
import { resolveUniverse } from "@/domain/availability";
import { recipes, ingredients, ingredientsById } from "@/domain/data";
import { shortNameOf } from "@/domain/displayName";
import { computeTarget, recipeMacros, roundMacros } from "@/domain/nutrition";
import {
  cookableRecipes,
  recipeAllowedByProfile,
  replaceMeal,
} from "@/domain/planner";
import {
  missingCookKind,
  missingCookLabel,
  missingNonSeasoningIds,
} from "@/domain/recommend";
import type { MealSlot } from "@/domain/types";
import { EQUIPMENT_LABEL, SLOT_LABEL } from "@/lib/labels";
import { useAppStore } from "@/store/useAppStore";

const REPLACE_RE = /^(\d+)-(breakfast|lunch|dinner)$/;

function Skeleton() {
  return (
    <PageShell>
      <div className="space-y-3">
        <div className="h-8 animate-pulse rounded-xl bg-[var(--color-surface-2)]" />
        <div className="h-40 animate-pulse rounded-2xl bg-[var(--color-surface-2)]" />
      </div>
    </PageShell>
  );
}

export function RecipeDetail({ id }: { id: string }) {
  return (
    <Suspense fallback={<Skeleton />}>
      <RecipeDetailReady id={id} />
    </Suspense>
  );
}

function RecipeDetailReady({ id }: { id: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const basketIds = useAppStore((s) => s.basketIds);
  const customIngredients = useAppStore((s) => s.customIngredients);
  const wantedRecipeIds = useAppStore((s) => s.wantedRecipeIds);
  const toggleWanted = useAppStore((s) => s.toggleWanted);
  const patchPlan = useAppStore((s) => s.patchPlan);
  const plan = useAppStore((s) => s.plan);
  const profile = useAppStore((s) => s.profile);
  const recipe = recipes.find((item) => item.id === id);
  const replaceRaw = searchParams.get("replace");
  const replaceMatch = replaceRaw ? REPLACE_RE.exec(replaceRaw) : null;
  const replaceDay = replaceMatch ? Number(replaceMatch[1]) : null;
  const replaceSlot = replaceMatch ? (replaceMatch[2] as MealSlot) : null;
  const replaceOk =
    plan?.feasible === true &&
    replaceDay != null &&
    Number.isInteger(replaceDay) &&
    replaceDay >= 0 &&
    replaceDay < plan.days &&
    replaceSlot != null;
  const recipesHref =
    replaceOk && replaceDay != null && replaceSlot
      ? `/recipes?replace=${replaceDay}-${replaceSlot}`
      : "/recipes";
  const blocked =
    !recipe ||
    (profile != null && !recipeAllowedByProfile(recipe, profile, ingredients));

  if (blocked) {
    return (
      <PageShell title="食谱详情">
        <div className="min-w-0 max-w-full space-y-3 break-words">
          <p className="text-sm text-[var(--color-text-2)]">找不到这道食谱。</p>
          <Link href={recipesHref} className="inline-flex min-h-11 items-center text-base text-[var(--color-brand)]">
            回灵感
          </Link>
        </div>
      </PageShell>
    );
  }

  const found = recipe;
  const byId = ingredientsById();
  const macros = roundMacros(recipeMacros(found, byId));
  const equipmentText =
    found.equipment.length > 0
      ? found.equipment.map((item) => EQUIPMENT_LABEL[item]).join("、")
      : "免开火";
  const universe = resolveUniverse(basketIds, customIngredients);
  const missing = missingNonSeasoningIds(found, universe, ingredients);
  const wanted = wantedRecipeIds.includes(found.id);
  const cookKind = missingCookKind(missing, universe);
  const joinOk =
    missing.length === 0 &&
    (!profile ||
      cookableRecipes([found], profile, ingredients, universe).length > 0);
  const replaceEligible =
    replaceOk &&
    replaceSlot != null &&
    found.mealSlots.includes(replaceSlot) &&
    (!profile ||
      cookableRecipes(recipes, profile, ingredients, universe).some(
        (item) => item.id === found.id,
      ));
  const canReplace = Boolean(replaceEligible && missing.length === 0);

  function doReplace() {
    if (
      !profile ||
      !plan ||
      plan.feasible === false ||
      !canReplace ||
      replaceSlot == null ||
      replaceDay == null
    ) {
      return;
    }
    const target = computeTarget(profile);
    const candidates = cookableRecipes(
      recipes,
      profile,
      ingredients,
      universe,
    );
    const next = replaceMeal(
      plan,
      replaceDay,
      replaceSlot,
      found.id,
      candidates,
      target,
      { profile, ingredients, universe },
      recipes,
    );
    patchPlan(next);
    router.push("/plan");
  }

  return (
    <PageShell title={found.name}>
      <div className="min-w-0 max-w-full space-y-4 break-words">
        <Link href={recipesHref} className="inline-flex min-h-11 items-center text-base text-[var(--color-brand)]">
          回灵感
        </Link>

        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-[var(--color-text-2)]">
            {equipmentText} · {found.timeMinutes} 分钟
          </p>
          <CookingVideoLink name={found.name}>教学视频</CookingVideoLink>
        </div>

        <p className="text-sm text-[var(--color-text-2)]">
          {missingCookLabel(cookKind)}
        </p>

        <div className="grid grid-cols-4 gap-2">
          {(
            [
              { label: "kcal", value: macros.kcal },
              { label: "P", value: `${macros.protein}g` },
              { label: "F", value: `${macros.fat}g` },
              { label: "C", value: `${macros.carb}g` },
            ] as const
          ).map((item) => (
            <div
              key={item.label}
              className="min-w-0 rounded-2xl border bg-[var(--color-surface)] px-2 py-2 text-center"
              style={{ borderColor: "var(--color-line)" }}
            >
              <p className="text-xs text-[var(--color-text-2)]">{item.label}</p>
              <p className="text-sm font-medium tabular-nums">{item.value}</p>
            </div>
          ))}
        </div>

        <section>
          <h2 className="mb-2 text-base font-semibold">食材</h2>
          <ul
            className="space-y-1.5 rounded-2xl border bg-[var(--color-surface)] p-3 text-base"
            style={{ borderColor: "var(--color-line)" }}
          >
            {found.ingredients.map((item, index) => {
              const ing = byId.get(item.id);
              const name = ing ? shortNameOf(ing) : item.id;
              return (
                <li
                  key={`${item.id}-${index}`}
                  className="flex min-w-0 items-baseline justify-between gap-2"
                >
                  <span className="min-w-0 break-words">{name}</span>
                  <span className="shrink-0 text-[var(--color-text-2)]">{item.grams}g</span>
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold">步骤</h2>
          <ol className="space-y-2">
            {found.steps.map((step, index) => (
              <li
                key={`${index}-${step}`}
                className="flex gap-2 rounded-2xl border bg-[var(--color-surface)] p-3 text-base"
                style={{ borderColor: "var(--color-line)" }}
              >
                <span className="shrink-0 font-medium text-[var(--color-brand)]">
                  {index + 1}.
                </span>
                <span className="min-w-0 break-words">{step}</span>
              </li>
            ))}
          </ol>
        </section>

        {missing.length > 0 ? (
          <p className="text-sm text-[var(--color-warn)]">
            缺{" "}
            {missing
              .map((mid) => {
                const ing = byId.get(mid);
                return ing ? `${shortNameOf(ing)}（${ing.name}）` : mid;
              })
              .join("、")}
          </p>
        ) : null}

        {canReplace ? (
          <button
            type="button"
            onClick={doReplace}
            className="min-h-12 w-full rounded-xl bg-[var(--color-brand)] text-base font-semibold text-white"
          >
            只换这一餐
          </button>
        ) : replaceOk && replaceSlot && !found.mealSlots.includes(replaceSlot) ? (
          <p className="text-base text-[var(--color-warn)]">
            餐位不符：这道菜不是{SLOT_LABEL[replaceSlot]}，不能替换这一餐。
          </p>
        ) : replaceOk && missing.length === 0 ? (
          <p className="text-base text-[var(--color-warn)]">
            当前篮或厨具做不了这道菜，不能只换这一餐。
          </p>
        ) : replaceOk ? null : joinOk || wanted ? (
          <button
            type="button"
            onClick={() => toggleWanted(found.id)}
            className="min-h-12 w-full rounded-xl bg-[var(--color-brand)] text-base font-semibold text-white"
          >
            {wanted ? "已加入" : "加入本周"}
          </button>
        ) : (
          <button
            type="button"
            disabled
            className="min-h-12 w-full rounded-xl bg-[var(--color-surface-2)] text-base font-semibold text-[var(--color-text-3)]"
          >
            加入本周
          </button>
        )}
      </div>
    </PageShell>
  );
}
