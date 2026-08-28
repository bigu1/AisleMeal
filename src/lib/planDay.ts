export function localYmd(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseLocalYmd(ymd: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function planDayIndex(
  planStartedOn: string | null,
  days: number,
  now = new Date(),
): number {
  if (!planStartedOn || days <= 0) return 0;
  const start = parseLocalYmd(planStartedOn);
  if (!start) return 0;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((today.getTime() - start.getTime()) / 86_400_000);
  return Math.min(days - 1, Math.max(0, diff));
}

const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"] as const;

export function planWeekdayLabel(
  planStartedOn: string | null,
  dayIdx: number,
  now = new Date(),
): string {
  const start = planStartedOn ? parseLocalYmd(planStartedOn) : null;
  const base =
    start ?? new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const date = new Date(base);
  date.setDate(base.getDate() + dayIdx);
  return `周${WEEKDAY[date.getDay()]}`;
}
