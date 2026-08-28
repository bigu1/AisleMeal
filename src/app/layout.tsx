import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { AppFrame } from "@/components/AppFrame";
import { BottomNav } from "@/components/BottomNav";
import { PersistResetToast } from "@/components/PersistResetToast";
import "./globals.css";

const assetBase = process.env.GITHUB_PAGES === "1" ? "/AisleMeal" : "";

export const metadata: Metadata = {
  title: "AisleMeal 货架健餐",
  description: "勾选手头食材，再选想吃的菜，排出三餐。数据只留本机。",
  manifest: `${assetBase}/manifest.webmanifest`,
  icons: {
    icon: `${assetBase}/favicon.ico`,
  },
};

export const viewport: Viewport = {
  themeColor: "#1F4D3A",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen antialiased">
        <AppFrame>{children}</AppFrame>
        <PersistResetToast />
        <BottomNav />
      </body>
    </html>
  );
}
