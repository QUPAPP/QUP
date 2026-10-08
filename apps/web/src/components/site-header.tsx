"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { logout } from "@/lib/api";
import { ME_QUERY_KEY, useCurrentUser } from "@/lib/session";

export function SiteHeader() {
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const router = useRouter();

  const signOut = useMutation({
    mutationFn: logout,
    onSettled: () => {
      // Whatever the server said, this browser no longer shows anyone's data.
      queryClient.clear();
      queryClient.setQueryData(ME_QUERY_KEY, null);
      router.replace("/");
    },
  });

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link href={user ? "/exams" : "/"} className="brand">
          <span className="brand__mark">QUP</span>
          <span className="small">خير معين لمستقبلك</span>
        </Link>
        <nav className="site-header__actions" aria-label="الحساب">
          {user ? (
            <>
              <span>{user.displayName ?? user.email ?? user.phone}</span>
              <button
                type="button"
                className="btn btn--on-dark"
                onClick={() => signOut.mutate()}
                disabled={signOut.isPending}
              >
                خروج
              </button>
            </>
          ) : (
            <Link href="/login" className="btn btn--on-dark">
              دخول
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
