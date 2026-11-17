import Image from "next/image";
import Link from "next/link";

const LOGO_WIDTH = 1983;
const LOGO_HEIGHT = 793;
const LOGO_SIZES = "(max-width: 520px) 112px, 136px";

/**
 * The QUP logo. `tone="light"` is the same mark with a white wordmark, for
 * navy and photographic backgrounds; the gold stroke is unchanged.
 *
 * The Q's gold fold is its own layer (cut from the same artwork, so it sits
 * exactly where it was drawn): it is drawn in once when the page loads and
 * steps forward when the logo is hovered. Without motion it is simply there.
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
  const light = tone === "light";
  return (
    <Link
      href={href}
      className={`brand brand--logo brand--${tone}`}
      aria-label="QUP — خير معين لمستقبلك"
    >
      <span className="brand-mark" aria-hidden="true">
        <Image
          src={light ? "/brand/qup-logo-light-base.png" : "/brand/qup-logo-v2-base.png"}
          width={LOGO_WIDTH}
          height={LOGO_HEIGHT}
          sizes={LOGO_SIZES}
          className="brand-logo"
          alt=""
        />
        <Image
          src={light ? "/brand/qup-logo-light-gold.png" : "/brand/qup-logo-gold.png"}
          width={LOGO_WIDTH}
          height={LOGO_HEIGHT}
          sizes={LOGO_SIZES}
          className="brand-logo brand-fold"
          alt=""
        />
      </span>
      {tagline ? <span className="brand-tagline">خير معين لمستقبلك</span> : null}
    </Link>
  );
}
