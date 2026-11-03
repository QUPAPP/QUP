"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { logout } from "@/lib/api";
import { ME_QUERY_KEY } from "@/lib/session";
import { Icon } from "./icon";

/**
 * `compact` keeps the label for screen readers but hides it on narrow screens,
 * so a header button never breaks onto two lines.
 */
export function SignOutButton({
  tone = "dark",
  compact = false,
}: {
  tone?: "dark" | "light";
  compact?: boolean;
}) {
  const client = useQueryClient();
  const router = useRouter();
  const signOut = useMutation({
    mutationFn: logout,
    onSettled: () => {
      client.clear();
      client.setQueryData(ME_QUERY_KEY, null);
      router.replace("/");
    },
  });
  const classes = [
    "sign-out",
    tone === "light" ? "sign-out--light" : "",
    compact ? "sign-out--compact" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type="button"
      className={classes}
      onClick={() => signOut.mutate()}
      disabled={signOut.isPending}
    >
      <Icon name="logout" />
      <span className="sign-out__label">{signOut.isPending ? "جارٍ الخروج…" : "تسجيل الخروج"}</span>
    </button>
  );
}
