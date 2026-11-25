import type { MetadataRoute } from "next";

import { PUBLIC_PAGES, siteUrl } from "@/lib/site";

// Rendered per request so APP_PUBLIC_URL is the running container's, not the build machine's.
export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return PUBLIC_PAGES.map(({ path, priority }) => ({
    url: new URL(path, base).toString(),
    priority,
  }));
}
