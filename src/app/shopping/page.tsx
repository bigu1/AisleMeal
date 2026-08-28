"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { DialogSheet } from "@/components/DialogSheet";
import { EmptyState } from "@/components/EmptyState";
import { PageShell } from "@/components/PageShell";
import { StoreSourceBanner } from "@/components/StoreSourceBanner";
import { ingredientsById } from "@/domain/data";
import { isBulkyPack } from "@/domain/shoppingList";
import { firstEnabledSlot } from "@/domain/nutrition";
import type { Category, ListUndo, NamedShoppingList } from "@/domain/types";
import { CATEGORY_LABEL } from "@/lib/labels";
import { planDayIndex } from "@/lib/planDay";
import {
  getActiveShoppingList,
  isShoppingItemChecked,
  shoppingListBought,
  useAppStore,
} from "@/store/useAppStore";

function useUndoLive(listUndo: ListUndo | null): boolean {
  const expiresAt = listUndo?.expiresAt ?? 0;
  return useSyncExternalStore(
    (onChange) => {
      if (!listUndo) return () => {};
      const remain = expiresAt - Date.now();
      if (remain <= 0) return () => {};
      const t = window.setTimeout(onChange, remain);
      return () => window.clearTimeout(t);
    },
    () => listUndo != null && Date.now() <= expiresAt,
    () => false,
  );
}

const GROUP_ORDER: Category[] = ["protein", "carb", "veg", "fat", "seasoning"];

function groupTitle(cat: Category): string {
  if (cat === "seasoning") return "调味品（家里有就不用买）";
  return CATEGORY_LABEL[cat];
}

export default function ShoppingPage() {
  return (
    <PageShell title="买菜">
      <ShoppingBody />
    </PageShell>
  );
}

function ShoppingBody() {
  const profile = useAppStore((s) => s.profile);
  const plan = useAppStore((s) => s.plan);
  const shoppingLists = useAppStore((s) => s.shoppingLists);
  const activeShoppingListId = useAppStore((s) => s.activeShoppingListId);
  const listUndo = useAppStore((s) => s.listUndo);
  const toggleListItemChecked = useAppStore((s) => s.toggleListItemChecked);
  const removeListItem = useAppStore((s) => s.removeListItem);
  const activateShoppingList = useAppStore((s) => s.activateShoppingList);
  const archiveActiveList = useAppStore((s) => s.archiveActiveList);
  const deleteShoppingList = useAppStore((s) => s.deleteShoppingList);
  const undoListChange = useAppStore((s) => s.undoListChange);
  const setProgressStep = useAppStore((s) => s.setProgressStep);
  const planStartedOn = useAppStore((s) => s.planStartedOn);
  const renameShoppingList = useAppStore((s) => s.renameShoppingList);
  const undoLive = useUndoLive(listUndo);
  const [removeId, setRemoveId] = useState<string | null>(null);

  if (!profile) {
    return (
      <EmptyState
        title="还没有身体档案"
        description="先建档，才能按餐单生成采购清单。"
        href="/onboarding"
        action="去建档"
      />
    );
  }

  const byIng = ingredientsById();
  const activeList = getActiveShoppingList({
    shoppingLists,
    activeShoppingListId,
  });

  if (!activeList && shoppingLists.length === 0) {
    return (
      <EmptyState
        title="还没有采购清单"
        description={
          plan?.feasible === true
            ? "回餐单生成具名采购清单。"
            : "先选出餐单，再生成采购清单。"
        }
        href="/plan"
        action="去餐单生成清单"
      />
    );
  }

  const grouped: Record<Category, NamedShoppingList["items"]> = {
    protein: [],
    carb: [],
    veg: [],
    fat: [],
    seasoning: [],
  };
  if (activeList) {
    for (const item of activeList.items) {
      const cat = byIng.get(item.ingredientId)?.category;
      if (cat && grouped[cat]) grouped[cat].push(item);
    }
  }

  const cookHref = `/cook?day=${planDayIndex(planStartedOn, plan?.feasible === true ? plan.days : 1)}&slot=${firstEnabledSlot(profile)}`;
  const emptyList = Boolean(activeList && activeList.items.length === 0);

  return (
    <div className="space-y-4">
      <StoreSourceBanner />
      {shoppingLists.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {shoppingLists.map((list) => {
            const bought = shoppingListBought(
              list,
              (id) => byIng.get(id)?.category,
            );
            const current = list.id === activeShoppingListId;
            return (
              <li key={list.id}>
                <button
                  type="button"
                  onClick={() => activateShoppingList(list.id)}
                  className="min-h-11 rounded-xl border px-3 text-sm"
                  style={{
                    borderColor: current
                      ? "var(--color-brand)"
                      : "var(--color-line)",
                    background: current
                      ? "var(--color-surface-2)"
                      : "var(--color-surface)",
                  }}
                >
                  {list.name}
                  {bought ? " · 已买完" : ""}
                  {list.stale ? " · 过期" : ""}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {undoLive ? (
        <button
          type="button"
          onClick={undoListChange}
          className="min-h-11 text-sm text-[var(--color-brand)]"
        >
          撤销刚才的改动
        </button>
      ) : null}
      {!activeList ? (
        <p className="text-sm text-[var(--color-text-2)]">
          点上方清单查看，或回餐单生成新清单。
        </p>
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <label className="min-w-0 flex-1 text-sm text-[var(--color-text-2)]">
              清单名
              <input
                type="text"
                defaultValue={activeList.name}
                key={activeList.id}
                maxLength={40}
                onBlur={(e) =>
                  renameShoppingList(activeList.id, e.target.value)
                }
                className="mt-1 min-h-11 w-full rounded-xl border bg-[var(--color-surface)] px-3 text-base text-[var(--color-text)]"
                style={{ borderColor: "var(--color-line)" }}
              />
            </label>
            {activeList.stale ? (
              <span className="text-xs text-[var(--color-warn)]">已过期</span>
            ) : null}
          </div>
          {activeList.stale ? (
            <p className="text-sm text-[var(--color-warn)]">
              餐单已改，重新生成才更新清单
            </p>
          ) : null}
          {emptyList ? (
            <p
              className="rounded-2xl border bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text-2)]"
              style={{ borderColor: "var(--color-line)" }}
            >
              还没有要买的
            </p>
          ) : null}
          {GROUP_ORDER.map((cat) => {
            const lines = grouped[cat];
            return (
              <section key={cat}>
                <h2 className="mb-2 text-sm font-semibold text-[var(--color-text)]">
                  {groupTitle(cat)}
                </h2>
                {lines.length === 0 ? (
                  <p className="text-xs text-[var(--color-text-3)]">无需购买</p>
                ) : (
                  <ul className="space-y-2">
                    {lines.map((line) => {
                      const ingredient = byIng.get(line.ingredientId);
                      if (!ingredient) return null;
                      const checked = isShoppingItemChecked(
                        activeList,
                        line.ingredientId,
                      );
                      const hintClass = line.storageHint?.includes("冷冻")
                        ? "text-[var(--color-warn)]"
                        : "text-red-600";
                      return (
                        <li
                          key={line.ingredientId}
                          className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-3"
                        >
                          <label className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                toggleListItemChecked(line.ingredientId)
                              }
                              className="mt-1 accent-[var(--color-brand)]"
                            />
                            <span className="min-w-0 flex-1 break-words">
                              <span
                                className={`block text-sm break-words text-[var(--color-text)] ${
                                  checked ? "text-[var(--color-text-3)] line-through" : ""
                                }`}
                              >
                                {ingredient.name} ×{line.packs}
                                {ingredient.pack.label}（{line.packGrams}g，实际需{" "}
                                {line.needGrams}g，富余 {line.surplusGrams}g）
                              </span>
                              {line.storageHint ? (
                                <span className={`mt-1 block text-xs ${hintClass}`}>
                                  {line.storageHint}
                                </span>
                              ) : null}
                              {isBulkyPack(line) ? (
                                <span className="mt-1 block text-xs text-[var(--color-warn)]">
                                  最小包装比用量大很多，家里有可去掉。不会拆成零售散装
                                </span>
                              ) : null}
                            </span>
                          </label>
                          <button
                            type="button"
                            onClick={() => setRemoveId(line.ingredientId)}
                            className="mt-1 min-h-11 text-xs text-[var(--color-text-3)]"
                          >
                            去掉这一行
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={archiveActiveList}
              className="min-h-11 text-sm text-[var(--color-text-2)]"
            >
              归档这批
            </button>
            <button
              type="button"
              onClick={() => deleteShoppingList(activeList.id)}
              className="min-h-11 text-sm text-[var(--color-warn)]"
            >
              删除这份清单
            </button>
            <Link
              href={cookHref}
              onClick={() => setProgressStep(5)}
              className="flex min-h-12 w-full items-center justify-center rounded-xl bg-[var(--color-brand)] text-base font-medium text-white"
            >
              去做今天
            </Link>
          </div>
        </>
      )}
      {removeId ? (
        <DialogSheet
          title="去掉这一行"
          titleId="remove-line-title"
          onClose={() => setRemoveId(null)}
        >
          <div className="space-y-2 px-4 py-3">
            <p className="text-sm text-[var(--color-text-2)]">
              餐单还要用这些食材。
            </p>
            <button
              type="button"
              onClick={() => {
                removeListItem(removeId);
                setRemoveId(null);
              }}
              className="min-h-12 w-full rounded-xl bg-[var(--color-brand)] text-base font-semibold text-white"
            >
              只从这单去掉
            </button>
            <Link
              href="/plan"
              className="flex min-h-12 w-full items-center justify-center rounded-xl border text-base"
              style={{ borderColor: "var(--color-line)" }}
            >
              去餐单重排
            </Link>
          </div>
        </DialogSheet>
      ) : null}
    </div>
  );
}
