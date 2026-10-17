"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { logout } from "@/lib/api";
import { ME_QUERY_KEY } from "@/lib/session";
import { Icon } from "./icon";

export function SignOutButton() {
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
  return (
    <button
      type="button"
      className="sign-out"
      onClick={() => signOut.mutate()}
      disabled={signOut.isPending}
    >
      <Icon name="logout" />
      {signOut.isPending ? "جارٍ الخروج…" : "تسجيل الخروج"}
    </button>
  );
}
