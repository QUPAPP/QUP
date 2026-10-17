import type { ReactNode } from "react";
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
        <Icon name="compass" />
        <h2>
          {register ? (
            <>
              بداية أوضح.
              <br />
              <span>لخطواتك القادمة.</span>
            </>
          ) : (
            <>
              كل خطوة تعلّم،
              <br />
              <span>تبدأ منك.</span>
            </>
          )}
        </h2>
        <p>
          {register
            ? "اكتشف مستواك بتشخيص مصغّر مجاني، وافهم نقاط قوتك وما يحتاج إلى تركيز."
            : "جلساتك ونتائجك في مكان واحد. ارجع إلى رحلتك، وأكمل من حيث توقفت."}
        </p>
        <div className="auth-story-note">QUP · خير معين لمستقبلك</div>
      </aside>
      {children}
    </main>
  );
}
