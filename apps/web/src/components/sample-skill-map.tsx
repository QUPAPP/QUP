import type { CSSProperties } from "react";
import type { MasteryState } from "@/lib/api";
import { MASTERY_STATE_LABELS } from "@/lib/mastery-labels";

/**
 * A static, clearly labelled example of the skill profile for the public
 * page. It mirrors the real profile's vocabulary but holds no student data.
 */
const sample: { skill: string; share: number; state: MasteryState }[] = [
  { skill: "الحساب", share: 0.91, state: "MASTERED" },
  { skill: "الهندسة", share: 0.84, state: "READY_FOR_REASSESSMENT" },
  { skill: "التناظر اللفظي", share: 0.58, state: "DEVELOPING" },
  { skill: "استيعاب المقروء", share: 0.37, state: "GAP" },
];

const PERCENT = 100;

export function SampleSkillMap() {
  return (
    <figure className="sample-map" aria-labelledby="sample-map-title">
      <div className="sample-map__head">
        <div>
          <p id="sample-map-title" className="sample-map__title">
            خريطة مهاراتك
          </p>
          <p className="sample-map__sub">بعد التشخيص</p>
        </div>
        <span className="sample-tag">مثال توضيحي</span>
      </div>
      <ul className="sample-map__rows">
        {sample.map((row) => (
          <li key={row.skill}>
            <div className="sample-map__label">
              <span>{row.skill}</span>
              <bdi>{Math.round(row.share * PERCENT)}٪</bdi>
            </div>
            <span className="profile-bar" aria-hidden="true">
              <span style={{ "--share": row.share } as CSSProperties} />
            </span>
            <span className={`mastery-badge mastery-badge--${row.state.toLowerCase()}`}>
              {MASTERY_STATE_LABELS[row.state]}
            </span>
          </li>
        ))}
      </ul>
      <figcaption className="sample-map__foot">
        <strong>أولويتك:</strong> استيعاب المقروء
      </figcaption>
    </figure>
  );
}
