import type { NextConfig } from "next";

/** 仅 GitHub Pages 项目站需要子路径；本地 `npm run dev` 仍是 / */
const pages = process.env.GITHUB_PAGES === "1";
const basePath = pages ? "/AisleMeal" : "";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  devIndicators: false,
  ...(pages
    ? { basePath, assetPrefix: basePath, trailingSlash: true }
    : {}),
};

export default nextConfig;
