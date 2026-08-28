"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

export function AppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hideNav =
    pathname === "/onboarding" || pathname.startsWith("/onboarding/");
  return (
    <div
      className="mx-auto min-h-screen min-w-0 max-w-md px-4 pt-4"
      style={{
        paddingBottom: hideNav
          ? "env(safe-area-inset-bottom)"
          : "calc(var(--bottom-nav) + 1.25rem + env(safe-area-inset-bottom))",
      }}
    >
      {children}
    </div>
  );
}
