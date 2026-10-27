import Image from "next/image";
import type { ReactNode } from "react";
import { Brand } from "./brand";
import { Icon } from "./icon";

export function AuthLayout({
  children,
  register = false,
}: {
  children: ReactNode;
  register?: boolean;
}) {
  return (
    <main id="main-content" className="auth-layout">
      <aside className="auth-story">
        <Image
          src="/brand/qup-mountain-journey-1200.webp"
          alt=""
          fill
          priority
          sizes="(max-width: 900px) 0px, 50vw"
          className="auth-story__photo"
        />
        <div className="auth-story__shade" aria-hidden="true" />
        <div className="auth-story__content">
          <Brand tone="light" tagline={false} />
          <div>
            <h2>
              {register ? (
                <>
                  بداية أوضح
                  <span>لخطواتك القادمة.</span>
                </>
              ) : (
                <>
                  رحلتك محفوظة.
                  <span>أكمل من حيث توقفت.</span>
                </>
              )}
            </h2>
            <p>
              {register
                ? "اكتشف مستواك بتشخيص مصغّر مجاني، وافهم نقاط قوتك وما يحتاج إلى تركيز."
                : "جلساتك ونتائجك وملف مهاراتك في مكان واحد. ارجع وأكمل خطوتك التالية."}
            </p>
          </div>
          <ul className="auth-story__points">
            <li>
              <Icon name="check" />
              التشخيص المصغّر مجاني
            </li>
            <li>
              <Icon name="check" />
              نتيجة مبدئية فور الإكمال
            </li>
            <li>
              <Icon name="check" />
              جلساتك محفوظة في حسابك
            </li>
          </ul>
        </div>
      </aside>
      <div className="auth-panel">
        <div className="auth-panel__brand">
          <Brand tagline={false} />
        </div>
        {children}
      </div>
    </main>
  );
}
