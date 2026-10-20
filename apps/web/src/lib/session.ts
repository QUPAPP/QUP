"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import type { Me, User } from "./api";
import { hasPermission } from "./permissions";
import { fetchMe, ME_QUERY_KEY } from "./session-cache";

export { ME_QUERY_KEY, startSession } from "./session-cache";

/**
 * The signed-in account with its roles and permissions, or null when there is
 * no session. Only a convenience for the interface: every protected call is
 * checked by the API itself.
 */
export function useMe() {
  return useQuery<Me | null>({ queryKey: ME_QUERY_KEY, queryFn: fetchMe, staleTime: 60_000 });
}

/** The signed-in user, or null when there is no session. Shares useMe's query. */
export function useCurrentUser() {
  return useQuery<Me | null, Error, User | null>({
    queryKey: ME_QUERY_KEY,
    queryFn: fetchMe,
    staleTime: 60_000,
    select: (me) => me?.user ?? null,
  });
}

/** Sends visitors without a session to sign in once the session check has answered. */
function useLoginRedirect(signedOut: boolean): void {
  const router = useRouter();
  useEffect(() => {
    if (signedOut) router.replace("/login");
  }, [signedOut, router]);
}

/** For pages that need an account: sends visitors without one to sign in. */
export function useRequireUser(): User | null {
  const { data: user, isSuccess } = useCurrentUser();
  useLoginRedirect(isSuccess && user === null);
  return user ?? null;
}

/**
 * For admin pages. `ready` turns true once the session check has answered;
 * `allowed` is false for an account without the permission, so the page can
 * show a no-permission state and skip its admin queries.
 */
export function useRequirePermission(code: string): {
  me: Me | null;
  allowed: boolean;
  ready: boolean;
} {
  const { data: me, isSuccess } = useMe();
  useLoginRedirect(isSuccess && me === null);
  return { me: me ?? null, allowed: hasPermission(me, code), ready: isSuccess };
}
