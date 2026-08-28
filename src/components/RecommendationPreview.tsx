"use client";

import { isProcessedMeat } from "@/domain/recommend";
import type { BasketPlanPreview } from "@/domain/recommend";
import { ingredients } from "@/domain/data";
import { shortNameOf } from "@/domain/displayName";
import { DialogSheet } from "./DialogSheet";
import { IngredientStatusBadge } from "./IngredientStatusBadge";

function IdList({ ids }: { ids: string[] }) {
  if (ids.length === 0) return <>无</>;
  return (
    <>
      {ids.map((id) => {
        const item = ingredients.find((row) => row.id === id);
        return (
          <span key={id} className="mr-1 inline-flex items-center gap-1">
            {item ? shortNameOf(item) : id}
            {item && isProcessedMeat(item) ? (
              <IngredientStatusBadge kind="processed" />
            ) : null}
          </span>
        );
      })}
    </>
  );
}

function PreviewCard({
  preview,
  currentPackCount,
  onApply,
  showBreakfast = true,
}: {
  preview: BasketPlanPreview;
  currentPackCount?: number;
  onApply: (preview: BasketPlanPreview) => void;
  showBreakfast?: boolean;
}) {
  const title = preview.style === "easy" ? "省事篮" : "换花样篮";
  const packDelta =
    preview.ok && preview.packCount != null && currentPackCount != null
      ? preview.packCount - currentPackCount
      : null;
  return (
    <article
      className="rounded-2xl border p-3"
      style={{ borderColor: "var(--color-line)" }}
    >
      <h3 className="text-base font-semibold text-[var(--color-text)]">{title}</h3>
      {!preview.ok ? (
        <p className="mt-2 text-base text-[var(--color-warn)]">
          {preview.hint ?? "这套凑不出可买的健康篮"}
        </p>
      ) : (
        <>
          <p className="mt-2 text-base text-[var(--color-text-2)]">
            新增 {preview.addIds.length === 0 ? "无" : <IdList ids={preview.addIds.slice(0, 6)} />}
            {preview.addIds.length > 6 ? "等" : ""}
          </p>
          <details className="mt-1">
            <summary className="min-h-11 cursor-pointer text-base text-[var(--color-text-2)]">
              保留 {preview.keepIds.length} 样
            </summary>
            <p className="mt-1 text-base text-[var(--color-text-2)]">
              <IdList ids={preview.keepIds} />
            </p>
          </details>
          <p className="mt-1 text-base text-[var(--color-text-2)]">
            移除 <IdList ids={preview.removeIds} />
          </p>
          <p className="mt-1 text-base text-[var(--color-text)]">
            {showBreakfast
              ? `早餐 ${preview.breakfastCount} · 正餐 ${preview.mainsCount}`
              : `正餐 ${preview.mainsCount}`}{" "}
            · 不同菜 {preview.uniquePlanned} · 重复 {preview.repeatMeals}
          </p>
          <p className="mt-1 text-base text-[var(--color-text-2)]">
            {packDelta == null
              ? preview.packCount != null
                ? `采购约 ${preview.packCount} 件包装`
                : ""
              : packDelta === 0
                ? "件数不变"
                : packDelta > 0
                  ? `大约多 ${packDelta} 件包装`
                  : `大约少 ${-packDelta} 件包装`}
          </p>
          <p className="mt-1 text-xs text-[var(--color-text-3)]">
            更高蛋白密度 · 正餐含蔬菜 · 少加工肉。这是估算搭配，不是医疗建议。
          </p>
        </>
      )}
      {preview.ok ? (
        <button
          type="button"
          onClick={() => onApply(preview)}
          className="mt-3 min-h-12 w-full rounded-xl bg-[var(--color-brand)] text-base font-semibold text-white"
        >
          用这套
        </button>
      ) : (
        <p className="mt-3 min-h-11 text-base text-[var(--color-text-3)]">凑不出</p>
      )}
    </article>
  );
}

export function RecommendationPreview({
  easy,
  variety,
  currentPackCount,
  onApply,
  onCancel,
  showBreakfast = true,
}: {
  easy: BasketPlanPreview;
  variety: BasketPlanPreview;
  currentPackCount?: number;
  onApply: (preview: BasketPlanPreview) => void;
  onCancel: () => void;
  showBreakfast?: boolean;
}) {
  return (
    <DialogSheet title="帮我配一篮" titleId="recommend-preview-title" onClose={onCancel}>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        <p className="text-base text-[var(--color-text-2)]">
          已勾加工肉会保留，不会新加加工肉。
        </p>
        <PreviewCard
          preview={easy}
          currentPackCount={currentPackCount}
          onApply={onApply}
          showBreakfast={showBreakfast}
        />
        <PreviewCard
          preview={variety}
          currentPackCount={currentPackCount}
          onApply={onApply}
          showBreakfast={showBreakfast}
        />
      </div>
      <div
        className="border-t px-4 py-3"
        style={{ borderColor: "var(--color-line)" }}
      >
        <button
          type="button"
          onClick={onCancel}
          className="min-h-12 w-full rounded-xl border text-base text-[var(--color-text)]"
          style={{ borderColor: "var(--color-line)" }}
        >
          取消
        </button>
      </div>
    </DialogSheet>
  );
}
