import type { QueryClient } from "@tanstack/react-query";

import { getMe, isApiError, type Me } from "./api";

export const ME_QUERY_KEY = ["me"] as const;

/** The signed-in account, or null when there is no session. */
export async function fetchMe(): Promise<Me | null> {
  try {
    return await getMe();
  } catch (error) {
    if (isApiError(error, "UNAUTHENTICATED")) return null;
    throw error;
  }
}

/**
 * After signing in or registering: drops everything cached for the previous
 * account and loads the new one from /auth/me, so its permissions are known
 * before the first page renders. (The login response carries only the user.)
 */
export async function startSession(client: QueryClient): Promise<Me | null> {
  client.clear();
  return client.fetchQuery({ queryKey: ME_QUERY_KEY, queryFn: fetchMe });
}
