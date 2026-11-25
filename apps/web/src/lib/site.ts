/**
 * The site's public address, for absolute links search engines and link
 * previews need (sitemap, robots, Open Graph). Read at request time from the
 * running container, like API_INTERNAL_URL, so one image serves any domain.
 */
const PRODUCTION_ADDRESS = "https://qupedu.com";

export function siteUrl(): URL {
  const configured = process.env.APP_PUBLIC_URL;
  return new URL(configured && URL.canParse(configured) ? configured : PRODUCTION_ADDRESS);
}

/** Public pages a search engine should find. Everything else needs an account. */
export const PUBLIC_PAGES = [
  { path: "/", priority: 1 },
  { path: "/register", priority: 0.8 },
  { path: "/login", priority: 0.5 },
  { path: "/tools/weighted-score", priority: 0.8 },
  { path: "/contact", priority: 0.5 },
  { path: "/terms", priority: 0.3 },
  { path: "/privacy", priority: 0.3 },
  { path: "/refund", priority: 0.3 },
] as const;

/** Areas behind sign-in, or not pages at all: never indexed. */
export const PRIVATE_PATHS = [
  "/api/",
  "/admin",
  "/account",
  "/dashboard",
  "/assessments/",
  "/exams/",
  "/subscriptions",
  "/payment/",
  "/verify-email",
  "/forgot-password",
] as const;
