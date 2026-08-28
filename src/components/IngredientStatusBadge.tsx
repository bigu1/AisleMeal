export function IngredientStatusBadge({
  kind,
}: {
  kind: "no-recipe" | "processed";
}) {
  if (kind === "no-recipe") {
    return (
      <span
        className="mt-0.5 inline-block rounded-full px-1.5 py-0.5 text-[12px] leading-4"
        style={{
          background: "var(--color-surface-2)",
          color: "var(--color-text-3)",
        }}
      >
        暂无对应菜
      </span>
    );
  }
  return (
    <span
      className="mt-0.5 inline-block rounded-full px-1.5 py-0.5 text-[12px] leading-4"
      style={{
        background: "var(--color-surface-2)",
        color: "var(--color-text-2)",
      }}
    >
      加工肉
    </span>
  );
}
