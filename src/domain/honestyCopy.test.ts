import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

function src(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("0.6 honesty copy", () => {
  it("省事与配一篮不说少买", () => {
    const style = src("src/components/PlanStyleSelector.tsx");
    const preview = src("src/components/RecommendationPreview.tsx");
    expect(style).toContain("件数少、可重复、适合备餐");
    expect(style).not.toMatch(/少买/);
    expect(preview).toContain("大约少 ${-packDelta} 件包装");
    expect(preview).toContain("大约多 ${packDelta} 件包装");
    expect(preview).not.toMatch(/少买|多买/);
  });

  it("店招只写已选食材数量，不写库存免责或店名", () => {
    const banner = src("src/components/StoreSourceBanner.tsx");
    expect(banner).toContain("已选");
    expect(banner).toContain("种食材");
    expect(banner).not.toMatch(/实时库存|capturedAt|莱翔|小象超市|我的货架/);
  });

  it("今天页不挂库存免责，开发指示器关闭", () => {
    const page = src("src/app/page.tsx");
    const config = src("next.config.ts");
    expect(page).not.toMatch(/实时库存|StoreSourceBanner|不是超市/);
    expect(config).toMatch(/devIndicators:\s*false/);
  });

  it("过敏免责与鸡肉品类提示在建档", () => {
    const page = src("src/app/onboarding/page.tsx");
    expect(page).toContain("按常见配方标，未化验；酱料未逐道拆。不是医疗建议。芝麻未列入。");
    expect(page).toContain("勾鸡肉任一口，胸/腿/爪都会排除");
    expect(page).not.toContain("只排除你勾的这一款");
    expect(page).toContain("toggleExclusionFamily");
  });

  it("大包装声明不拆零售", () => {
    const shopping = src("src/app/shopping/page.tsx");
    expect(shopping).toContain("不会拆成零售散装");
  });

  it("persist 升到 version 8，键名仍 aislemeal:v1", () => {
    const store = src("src/store/useAppStore.ts");
    expect(store).toMatch(/name: "aislemeal:v1"/);
    expect(store).toMatch(/version: 8/);
  });
});
