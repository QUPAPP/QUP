"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";

import { ApiError } from "@/lib/api";

const MAX_RETRIES = 2;
const SERVER_ERROR = 500;

/** Server state lives in TanStack Query (AGENTS.md §9). */
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // A 4xx is an answer, not a glitch: retrying it only delays the message.
            retry: (failures, error) =>
              failures < MAX_RETRIES && !(error instanceof ApiError && error.status < SERVER_ERROR),
            refetchOnWindowFocus: false,
          },
          mutations: { retry: false },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
