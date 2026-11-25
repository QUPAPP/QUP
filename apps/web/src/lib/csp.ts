/**
 * Content Security Policy for every page (SECURITY.md "Web Security", C4).
 * Scripts run only with this request's nonce, which Next.js adds to its own
 * scripts during rendering; 'strict-dynamic' lets those load the bundles they
 * import. Inline styles stay allowed: components set style attributes, which a
 * nonce cannot cover, and injected CSS cannot run code.
 */

const NONCE_BYTES = 16;

export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  return btoa(String.fromCharCode(...bytes));
}

export function buildContentSecurityPolicy(options: {
  nonce: string;
  /** React's development build uses eval for its debugging; production never does. */
  development: boolean;
}): string {
  // The Turnstile host is for browsers without 'strict-dynamic'; newer ones trust it as loaded by our own script.
  const scriptSources = [
    "'self'",
    `'nonce-${options.nonce}'`,
    "'strict-dynamic'",
    "https://challenges.cloudflare.com",
  ];
  if (options.development) scriptSources.push("'unsafe-eval'");
  const directives = [
    "default-src 'self'",
    `script-src ${scriptSources.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    // Cloudflare Turnstile, the human check on sign-up (components/human-check.tsx).
    "frame-src https://challenges.cloudflare.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // Local development runs over plain HTTP.
    ...(options.development ? [] : ["upgrade-insecure-requests"]),
  ];
  return directives.join("; ");
}
