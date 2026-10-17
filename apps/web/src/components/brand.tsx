import Image from "next/image";
import Link from "next/link";

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="brand brand--logo" aria-label="QUP — خير معين لمستقبلك">
      <Image
        src="/brand/qup-logo-v2.png"
        width={1983}
        height={793}
        sizes="(max-width: 520px) 112px, 136px"
        className="brand-logo"
        alt=""
        aria-hidden="true"
      />
      <span className="brand-tagline">خير معين لمستقبلك</span>
    </Link>
  );
}
