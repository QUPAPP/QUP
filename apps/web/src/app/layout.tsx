import type { Metadata, Viewport } from "next";
import { Noto_Kufi_Arabic, Noto_Sans_Arabic } from "next/font/google";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

import { Providers } from "./providers";

import "./globals.css";

// UI_BRAND.md: Kufi for headings and buttons, Sans for body and dense content.
const kufi = Noto_Kufi_Arabic({
  subsets: ["arabic"],
  weight: ["600", "700"],
  display: "swap",
  variable: "--font-kufi",
});

const sansArabic = Noto_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "600"],
  display: "swap",
  variable: "--font-sans-arabic",
});

export const metadata: Metadata = {
  title: { default: "QUP — خطوتك تبدأ بفهم مستواك", template: "%s — QUP" },
  description:
    "ابدأ بتشخيص مصغّر مجاني، وتعرّف على نقاط قوتك وما يحتاج إلى تركيز. جلساتك ونتائجك في مكان واحد.",
};

export const viewport: Viewport = { themeColor: "#081f3d" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // RTL first (AGENTS.md §9): direction is set once, at the root.
    <html
      lang="ar"
      dir="rtl"
      data-scroll-behavior="smooth"
      className={`${kufi.variable} ${sansArabic.variable}`}
    >
      <body>
        <Providers>
          <a href="#main-content" className="skip-link">
            انتقل إلى المحتوى
          </a>
          <SiteHeader />
          <AppShell>{children}</AppShell>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
