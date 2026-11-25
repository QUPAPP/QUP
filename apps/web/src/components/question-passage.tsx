import type { RichContent as RichContentData } from "@/lib/api";
import { RichContent } from "./rich-content";

/**
 * A reading passage shown above the question it belongs to (استيعاب المقروء,
 * STEP reading or listening). Several questions share it; it is the same on each.
 */
export function QuestionPassage({
  passage,
}: {
  passage: { id: string; content: RichContentData } | null | undefined;
}) {
  if (!passage) return null;
  return (
    <section className="question-passage" aria-label="قطعة القراءة">
      <p className="question-passage__label">اقرأ القطعة ثم أجب</p>
      <div className="question-passage__body">
        <RichContent content={passage.content} />
      </div>
    </section>
  );
}
