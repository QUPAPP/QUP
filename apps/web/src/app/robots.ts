import type { MetadataRoute } from "next";

import { PRIVATE_PATHS, siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: [...PRIVATE_PATHS] },
    sitemap: new URL("/sitemap.xml", siteUrl()).toString(),
  };
}
