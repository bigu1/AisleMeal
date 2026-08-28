import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("GitHub Pages config", () => {
  it("本地 next.config 无默认 basePath，Pages 才开 /AisleMeal", () => {
    const src = readFileSync(path.join(root, "next.config.ts"), "utf8");
    expect(src).toMatch(/output:\s*"export"/);
    expect(src).toMatch(/GITHUB_PAGES === "1"/);
    expect(src).toMatch(/pages \? "\/AisleMeal" : ""/);
    expect(src).toContain("basePath, assetPrefix: basePath");
  });

  it("manifest 用相对路径，项目站不会打到 github.io 根", () => {
    const manifest = JSON.parse(
      readFileSync(path.join(root, "public/manifest.webmanifest"), "utf8"),
    ) as { start_url: string; icons: { src: string }[] };
    expect(manifest.start_url).toBe("./");
    expect(manifest.icons.every((icon) => !icon.src.startsWith("/"))).toBe(
      true,
    );
  });

  it("layout 元数据在 Pages 构建带 /AisleMeal", () => {
    const src = readFileSync(path.join(root, "src/app/layout.tsx"), "utf8");
    expect(src).toContain('process.env.GITHUB_PAGES === "1" ? "/AisleMeal" : ""');
    expect(src).toContain("${assetBase}/manifest.webmanifest");
    expect(src).toContain("${assetBase}/favicon.ico");
  });

  it("CI 只校验不发布，禁止 deploy-pages", () => {
    const ci = readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
    expect(ci).toContain("npm run build-data && npm run lint && npm test && npm run build");
    expect(ci).not.toMatch(/deploy-pages|GITHUB_PAGES=1|upload-pages-artifact/);
  });
});
