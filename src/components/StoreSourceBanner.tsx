"use client";

import { useAppStore } from "@/store/useAppStore";

export function StoreSourceBanner({ extra }: { extra?: string }) {
  const n = useAppStore(
    (s) => s.basketIds.length + s.customIngredients.length,
  );
  return (
    <p className="rounded-xl bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text-2)]">
      已选 {n} 种食材
      {extra ? ` · ${extra}` : ""}
    </p>
  );
}
