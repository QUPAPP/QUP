"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { acceptTerms } from "@/lib/api";
import { LEGAL_UPDATED_AT } from "@/lib/legal";
import { ME_QUERY_KEY, useMe } from "@/lib/session";
import { Icon } from "./icon";
import { ErrorNotice } from "./status";

/**
 * After the terms or privacy policy change (LEGAL_UPDATED_AT moves), a
 * signed-in person is asked to read and accept them; the acceptance is
 * recorded with the version and the time (OPEN_QUESTIONS.md #6d). Accounts
 * from before consent was recorded are asked too.
 */
export function TermsUpdateBanner() {
  const client = useQueryClient();
  const { data: me } = useMe();
  const accept = useMutation({
    mutationFn: () => acceptTerms(LEGAL_UPDATED_AT),
    onSuccess: () => client.invalidateQueries({ queryKey: ME_QUERY_KEY }),
  });
  if (!me || me.user.acceptedTermsVersion === LEGAL_UPDATED_AT) return null;
  return (
    <div className="email-banner" role="status">
      <Icon name="shield" />
      <p>
        حدّثنا <Link href="/terms">الشروط والأحكام</Link> و
        <Link href="/privacy">سياسة الخصوصية</Link>. اطّلع عليهما، ثم وافق لنسجّل موافقتك.
      </p>
      {accept.isError ? <ErrorNotice error={accept.error} /> : null}
      <button
        type="button"
        className="btn btn--ghost btn--small"
        disabled={accept.isPending}
        onClick={() => accept.mutate()}
      >
        {accept.isPending ? "جارٍ الحفظ…" : "قرأتهما وأوافق"}
      </button>
    </div>
  );
}
