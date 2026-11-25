"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { getSignUpOptions } from "@/lib/api";

/** Cloudflare's widget script, loaded only on a page that shows the check. */
const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render(
    element: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      language: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ): string;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | null = null;

/** One script for the whole app, however many widgets mount. */
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile missing"));
    script.onerror = () => {
      loading = null;
      reject(new Error("Turnstile failed to load"));
    };
    document.head.append(script);
  });
  return loading;
}

/** The site key, or null when this deployment has no human check (TURNSTILE_* unset). */
export function useHumanCheckSiteKey(): string | null {
  const options = useQuery({
    queryKey: ["sign-up-options"],
    queryFn: getSignUpOptions,
    staleTime: Number.POSITIVE_INFINITY,
  });
  return options.data?.captchaSiteKey ?? null;
}

/**
 * Cloudflare Turnstile: usually invisible, sometimes one click. Hands the
 * form a token (or null when it expires); the API checks it with Cloudflare.
 * Remount it (change its key) after a failed submission to get a new token:
 * each one is good for a single check.
 */
export function HumanCheck({
  siteKey,
  action,
  onToken,
}: {
  siteKey: string;
  action: "register" | "forgot-password";
  onToken: (token: string | null) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const report = useRef(onToken);
  report.current = onToken;

  useEffect(() => {
    let widgetId: string | null = null;
    let cancelled = false;
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !container.current) return;
        widgetId = turnstile.render(container.current, {
          sitekey: siteKey,
          action,
          language: "ar",
          callback: (token) => report.current(token),
          "expired-callback": () => report.current(null),
          "error-callback": () => report.current(null),
        });
      })
      .catch(() => report.current(null));
    return () => {
      cancelled = true;
      if (widgetId !== null) window.turnstile?.remove(widgetId);
    };
  }, [siteKey, action]);

  return <div ref={container} className="human-check" />;
}
