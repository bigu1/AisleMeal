"use client";

import type { ReactNode } from "react";
import { useHasMounted } from "@/hooks/useHasMounted";

export function PageShell({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  const mounted = useHasMounted();
  if (!mounted) {
    return (
      <main className="space-y-3">
        <div className="h-8 animate-pulse rounded-xl bg-[var(--color-surface-2)]" />
        <div className="h-40 animate-pulse rounded-2xl bg-[var(--color-surface-2)]" />
      </main>
    );
  }
  return (
    <main>
      {title ? (
        <h1 className="mb-3 text-[22px] font-semibold leading-7 text-[var(--color-text)]">
          {title}
        </h1>
      ) : null}
      {children}
    </main>
  );
}
