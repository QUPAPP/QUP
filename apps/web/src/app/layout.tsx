import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { siteUrl } from "@/lib/site";

import { Providers } from "./providers";

import "./globals.css";

// UI_BRAND.md: Kufi for headings, a Sans for body and dense content. Plex
// carries real 500/600 weights, so hierarchy does not lean on bold alone.
// The fonts ship with the app instead of being fetched from Google at build
// time, so a build never depends on reaching fonts.googleapis.com.
import "@fontsource-variable/noto-kufi-arabic/wght.css";
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "@fontsource/ibm-plex-sans-arabic/700.css";
// Formula typesetting (lib/math.ts); its fonts ship with the app like the others.
import "katex/dist/katex.min.css";

const SITE_TITLE = "QUP — خطوتك تبدأ بفهم مستواك";
const SITE_DESCRIPTION =
  "ابدأ بتشخيص مصغّر مجاني، وتعرّف على نقاط قوتك وما يحتاج إلى تركيز. جلساتك ونتائجك في مكان واحد.";
/** The image a shared link shows (WhatsApp, X, search results). */
const SHARE_IMAGE = { url: "/brand/qup-mountain-journey-1200.webp", width: 1200, alt: "QUP" };

/** Per request, like the pages: the absolute address comes from the running container (lib/site.ts). */
export function generateMetadata(): Metadata {
  return {
    metadataBase: siteUrl(),
    title: { default: SITE_TITLE, template: "%s — QUP" },
    description: SITE_DESCRIPTION,
    openGraph: {
      type: "website",
      locale: "ar_SA",
      siteName: "QUP",
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
      images: [SHARE_IMAGE],
    },
    twitter: { card: "summary_large_image", title: SITE_TITLE, description: SITE_DESCRIPTION },
  };
}

export const viewport: Viewport = { themeColor: "#081f3d" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Every page renders per request, so Next.js can put this request's CSP
  // nonce on its scripts (src/proxy.ts). A page built ahead of time has none.
  await connection();
  return (
    // RTL first (AGENTS.md §9): direction is set once, at the root.
    <html lang="ar" dir="rtl" data-scroll-behavior="smooth">
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
