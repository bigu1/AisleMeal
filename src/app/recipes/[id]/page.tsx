import { Suspense } from "react";
import { PageShell } from "@/components/PageShell";
import { recipes } from "@/domain/data";
import { RecipeDetail } from "./RecipeDetail";

export function generateStaticParams() {
  return recipes.map((recipe) => ({ id: recipe.id }));
}

export default async function RecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense
      fallback={
        <PageShell>
          <div className="h-40 animate-pulse rounded-2xl bg-[var(--color-surface-2)]" />
        </PageShell>
      }
    >
      <RecipeDetail id={id} />
    </Suspense>
  );
}
