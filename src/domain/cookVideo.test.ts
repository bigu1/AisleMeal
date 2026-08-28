import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { cookingVideoSearchUrl } from "./cookVideo";
import { recipes } from "./data";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("教学视频", () => {
  it("用真实菜名生成 B 站搜索链接", () => {
    const recipe = recipes.find((item) => item.id === "airfryer-chicken-rice") ?? recipes[0];
    expect(recipe?.name).toBeTruthy();
    const url = cookingVideoSearchUrl(recipe.name);
    expect(url.startsWith("https://")).toBe(true);
    expect(url).toContain("search.bilibili.com");
    expect(url).toContain(encodeURIComponent(recipe.name));
    expect(url).not.toMatch(/meituan/);
  });

  it("跟做页和食谱详情有教学视频按钮且保留步骤", () => {
    const cook = readFileSync(path.join(here, "../app/cook/page.tsx"), "utf8");
    const detail = readFileSync(
      path.join(here, "../app/recipes/[id]/RecipeDetail.tsx"),
      "utf8",
    );
    const link = readFileSync(
      path.join(here, "../components/CookingVideoLink.tsx"),
      "utf8",
    );
    const nav = readFileSync(path.join(here, "../components/BottomNav.tsx"), "utf8");
    expect(cook).toMatch(/教学视频/);
    expect(cook).toMatch(/recipe\.steps/);
    expect(cook).toMatch(/CookingVideoLink/);
    expect(detail).toMatch(/教学视频/);
    expect(detail).toMatch(/CookingVideoLink/);
    expect(link).toMatch(/cookingVideoSearchUrl\(name\)/);
    expect(link).toMatch(/教学视频/);
    expect(cook).toMatch(/这道菜已下架，请回餐单重新排出/);
    expect(nav).toMatch(/href: "\/"/);
    expect(nav).toMatch(/今天/);
    expect(nav).not.toMatch(/href: "\/cook"/);
    expect(cook).not.toMatch(/meituan\.com/);
    expect(detail).not.toMatch(/meituan\.com/);
  });
});
