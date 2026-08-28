import { cookingVideoSearchUrl } from "@/domain/cookVideo";

export function CookingVideoLink({
  name,
  children = "教学视频",
}: {
  name: string;
  children?: string;
}) {
  return (
    <span className="inline-flex flex-col items-end">
      <a
        href={cookingVideoSearchUrl(name)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 min-w-11 items-center rounded-xl border px-3 py-1.5 text-sm text-[var(--color-brand)]"
        style={{ borderColor: "var(--color-line)" }}
      >
        {children}
      </a>
      <span className="mt-0.5 text-[11px] leading-4 text-[var(--color-text-3)]">
        B 站搜索，不是指定视频
      </span>
    </span>
  );
}
