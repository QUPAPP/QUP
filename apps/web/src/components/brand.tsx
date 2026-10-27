import Image from "next/image";
import Link from "next/link";

/**
 * The QUP logo. `tone="light"` is the same mark with a white wordmark, for
 * navy and photographic backgrounds; the gold stroke is unchanged.
 */
export function Brand({
  href = "/",
  tone = "dark",
  tagline = true,
}: {
  href?: string;
  tone?: "dark" | "light";
  tagline?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`brand brand--logo brand--${tone}`}
      aria-label="QUP — خير معين لمستقبلك"
    >
      <Image
        src={tone === "light" ? "/brand/qup-logo-light.png" : "/brand/qup-logo-v2.png"}
        width={1983}
        height={793}
        sizes="(max-width: 520px) 112px, 136px"
        className="brand-logo"
        alt=""
        aria-hidden="true"
      />
      {tagline ? <span className="brand-tagline">خير معين لمستقبلك</span> : null}
    </Link>
  );
}
