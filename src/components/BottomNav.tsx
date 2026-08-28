"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, ClipboardList, House, ShoppingBag } from "lucide-react";

const TABS = [
  { href: "/", label: "今天", icon: House, id: "today" },
  { href: "/plan", label: "餐单", icon: ClipboardList, id: "plan" },
  { href: "/shopping", label: "买菜", icon: ShoppingBag, id: "shop" },
  { href: "/recipes", label: "灵感", icon: BookOpen, id: "ideas" },
] as const;

function currentTab(pathname: string): (typeof TABS)[number]["id"] | null {
  if (pathname === "/onboarding" || pathname.startsWith("/onboarding/")) {
    return null;
  }
  if (pathname === "/" || pathname === "/cook" || pathname.startsWith("/cook/")) {
    return "today";
  }
  if (
    pathname === "/plan" ||
    pathname.startsWith("/plan/") ||
    pathname === "/basket" ||
    pathname.startsWith("/basket/")
  ) {
    return "plan";
  }
  if (pathname === "/shopping" || pathname.startsWith("/shopping/")) {
    return "shop";
  }
  if (pathname === "/recipes" || pathname.startsWith("/recipes/")) {
    return "ideas";
  }
  return null;
}

export function BottomNav() {
  const pathname = usePathname();
  const current = currentTab(pathname);
  if (current == null) return null;
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t bg-[var(--color-surface)]/95 backdrop-blur"
      style={{
        borderColor: "var(--color-line)",
        boxShadow: "0 -8px 24px rgba(31,77,58,0.08)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <ul className="mx-auto flex max-w-md">
        {TABS.map((tab) => {
          const active = current === tab.id;
          const exact = pathname === tab.href;
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={exact ? "page" : active ? "true" : undefined}
                className={
                  active
                    ? "flex min-h-12 w-full items-stretch text-[var(--color-brand)] active:text-[var(--color-brand-press)]"
                    : "flex min-h-12 w-full items-stretch text-[var(--color-text-3)] active:text-[var(--color-brand-press)]"
                }
              >
                <span
                  className="mx-1 flex h-full w-full flex-col items-center justify-center gap-0.5 rounded-xl text-xs"
                  style={{
                    background: active
                      ? "var(--color-brand-soft)"
                      : "transparent",
                  }}
                >
                  <Icon size={20} strokeWidth={active ? 2 : 1.75} fill="none" />
                  <span className={active ? "font-semibold" : undefined}>
                    {tab.label}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
