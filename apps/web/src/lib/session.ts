"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { getMe, isApiError, type User } from "./api";

export const ME_QUERY_KEY = ["me"] as const;

/**
 * The signed-in user, or null when there is no session. Only a convenience
 * for the interface: every protected call is checked by the API itself.
 */
export function useCurrentUser() {
  return useQuery<User | null>({
    queryKey: ME_QUERY_KEY,
    queryFn: async () => {
      try {
        return (await getMe()).user;
      } catch (error) {
        if (isApiError(error, "UNAUTHENTICATED")) return null;
        throw error;
      }
    },
    staleTime: 60_000,
  });
}

/** For pages that need an account: sends visitors without one to sign in. */
export function useRequireUser(): User | null {
  const { data: user, isSuccess } = useCurrentUser();
  const router = useRouter();
  useEffect(() => {
    if (isSuccess && user === null) router.replace("/login");
  }, [isSuccess, user, router]);
  return user ?? null;
}
