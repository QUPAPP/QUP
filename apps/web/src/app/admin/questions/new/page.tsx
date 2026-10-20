"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminGate } from "@/components/admin/admin-gate";
import { QuestionEditor } from "@/components/admin/question-editor/question-editor";
import { Icon } from "@/components/icon";
import { PageHeading } from "@/components/page-heading";
import { ADMIN_PERMISSIONS } from "@/lib/permissions";

export default function NewQuestionPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  return (
    <AdminGate permission={ADMIN_PERMISSIONS.questionsCreate}>
      {(me) => (
        <main id="main-content" className="page stack stack--loose">
          <Link href="/admin/questions" className="text-link">
            بنك الأسئلة <Icon name="arrow" />
          </Link>
          <PageHeading
            title="سؤال جديد"
            description="يُحفظ السؤال مسودة. أرسله للمراجعة حين يكتمل، ثم يُنشر بعد اعتماده."
          />
          <section className="card">
            <QuestionEditor
              mode="create"
              userId={me.user.id}
              onSaved={async (version) => {
                await queryClient.invalidateQueries({ queryKey: ["admin-questions", me.user.id] });
                router.push(`/admin/question-versions/${version.id}`);
              }}
            />
          </section>
        </main>
      )}
    </AdminGate>
  );
}
