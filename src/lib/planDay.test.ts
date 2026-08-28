import { describe, expect, it } from "vitest";
import { planDayIndex } from "./planDay";

describe("planDayIndex", () => {
  it("null 或非法日期回 0", () => {
    expect(planDayIndex(null, 7)).toBe(0);
    expect(planDayIndex("not-a-date", 7)).toBe(0);
    expect(planDayIndex("2026-08-20", 0)).toBe(0);
  });

  it("按本地日历差夹紧到 [0, days)", () => {
    const start = new Date(2026, 7, 20);
    expect(planDayIndex("2026-08-20", 7, start)).toBe(0);
    expect(planDayIndex("2026-08-20", 7, new Date(2026, 7, 22))).toBe(2);
    expect(planDayIndex("2026-08-20", 3, new Date(2026, 7, 30))).toBe(2);
    expect(planDayIndex("2026-08-20", 7, new Date(2026, 7, 19))).toBe(0);
  });
});
