import path from "node:path";

import type { NextConfig } from "next";

/**
 * The browser never talks to the API directly: it calls this app's own
 * /api/v1/*, which src/app/api/v1/[...path]/route.ts forwards. One origin
 * means no CORS, a first-party session cookie, and an API address that is a
 * runtime setting (API_INTERNAL_URL) rather than something baked into the build.
 */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const config: NextConfig = {
  // A self-contained server for the Docker image (apps/web/Dockerfile).
  output: "standalone",
  // pnpm workspace: dependencies live at the repository root.
  outputFileTracingRoot: path.join(import.meta.dirname, "../../"),
  poweredByHeader: false,
  reactStrictMode: true,
  headers: async () => [{ source: "/:path*", headers: SECURITY_HEADERS }],
};

export default config;
