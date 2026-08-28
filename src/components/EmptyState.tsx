"use client";

import Link from "next/link";

export function EmptyState({
  title,
  description,
  href,
  action,
}: {
  title: string;
  description: string;
  href: string;
  action: string;
}) {
  return (
    <div
      className="rounded-2xl border bg-[var(--color-surface)] p-6 text-center"
      style={{ borderColor: "var(--color-line)" }}
    >
      <h2 className="text-base font-semibold text-[var(--color-text)]">{title}</h2>
      <p className="mt-2 text-sm text-[var(--color-text-2)]">{description}</p>
      <Link
        href={href}
        className="mt-4 inline-flex min-h-12 items-center rounded-xl bg-[var(--color-brand)] px-4 text-base font-semibold text-white"
      >
        {action}
      </Link>
    </div>
  );
}
