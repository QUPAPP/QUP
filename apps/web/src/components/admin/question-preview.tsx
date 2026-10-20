import type { QuestionVersion, TaxonomyOutline } from "@/lib/question-api";
import { DIFFICULTY_PRESETS, QUESTION_TYPES } from "@/lib/question-form";
import { RichContent } from "../rich-content";

const ROLE_LABEL = { PRIMARY: "أساسية", SECONDARY: "ثانوية" } as const;

/** Node id → readable name from the version's outline ("skill ← subskill"). */
function nodeNames(outline: TaxonomyOutline | undefined): Map<string, string> {
  const names = new Map<string, string>();
  for (const domain of outline?.domains ?? []) {
    for (const skill of domain.skills) {
      names.set(skill.id, skill.name);
      for (const subskill of skill.subskills) {
        names.set(subskill.id, `${skill.name} ← ${subskill.name}`);
      }
    }
  }
  return names;
}

/**
 * A version as an admin reviews it: the question as a student would read it,
 * plus what students never see — the answer key, explanation, mappings,
 * difficulty and source. Content is rendered as text, never HTML.
 */
export function QuestionPreview({
  version,
  outline,
}: {
  version: QuestionVersion;
  outline: TaxonomyOutline | undefined;
}) {
  const names = nodeNames(outline);
  const preset = DIFFICULTY_PRESETS.find((p) => p.value === version.difficulty);
  const type = QUESTION_TYPES.find((t) => t.value === version.questionType);
  const options = [...version.options].sort((a, b) => a.displayOrder - b.displayOrder);

  return (
    <div className="question-preview stack">
      <p className="small muted">{type?.label}</p>
      <p className="question-preview__stem">
        {version.stem.blocks.length > 0 ? <RichContent content={version.stem} /> : "(بلا نص)"}
      </p>
      {options.length === 0 ? (
        <p className="small muted">لا توجد خيارات.</p>
      ) : (
        <ol className="question-preview__options">
          {options.map((option) => (
            <li
              key={option.key}
              className={
                option.isCorrect
                  ? "question-preview__option is-correct"
                  : "question-preview__option"
              }
            >
              <span className="question-preview__key" dir="ltr">
                {option.key}
              </span>
              <span>
                <RichContent content={option.content} />
              </span>
              {option.isCorrect ? <strong className="small">✓ إجابة صحيحة</strong> : null}
            </li>
          ))}
        </ol>
      )}

      <dl className="question-preview__meta">
        <dt>الشرح</dt>
        <dd>{version.explanation ? <RichContent content={version.explanation} /> : "لا يوجد"}</dd>
        <dt>المهارات</dt>
        <dd>
          {version.mappings.length === 0 ? (
            "لم تُربط بعد"
          ) : (
            <ul className="problem-list">
              {version.mappings.map((mapping) => {
                const id = mapping.skillId ?? mapping.subskillId ?? "";
                return (
                  <li key={id}>
                    {`${names.get(id) ?? "مهارة غير متاحة في الشجرة الحالية"} — ${ROLE_LABEL[mapping.role]} (الوزن ${mapping.attributionWeight})`}
                    {mapping.rationale ? ` · ${mapping.rationale}` : ""}
                  </li>
                );
              })}
            </ul>
          )}
        </dd>
        <dt>الصعوبة</dt>
        <dd>{preset ? preset.label : `مخصص (${version.difficulty})`}</dd>
        <dt>المصدر</dt>
        <dd>
          {[version.sourceType, version.sourceReference].filter(Boolean).join(" · ") || "غير محدد"}
        </dd>
      </dl>
    </div>
  );
}
