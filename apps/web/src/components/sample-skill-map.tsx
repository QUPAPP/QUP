import type { MasteryState } from "@/lib/api";
import { Fold } from "./fold";
import { SkillRow, StateWord } from "./skill-row";
import { Tiles } from "./skill-tiles";

/**
 * A static, clearly labelled example of the skill profile for the public
 * page. It mirrors the real profile's vocabulary but holds no student data.
 */
const sample: { skill: string; answered: number; correct: number; state: MasteryState }[] = [
  { skill: "التناظر اللفظي", answered: 18, correct: 16, state: "MASTERED" },
  { skill: "إكمال الجمل", answered: 12, correct: 9, state: "READY_FOR_REASSESSMENT" },
  { skill: "استيعاب المقروء", answered: 6, correct: 3, state: "UNCERTAIN" },
  { skill: "المتتاليات", answered: 9, correct: 3, state: "GAP" },
  { skill: "الكسور والنسب", answered: 14, correct: 4, state: "GAP" },
];

/** The rest of a 31-skill exam, so the tile row reads as a whole profile. */
const sampleTiles: MasteryState[] = [
  ...sample.map((row) => row.state),
  ...Array<MasteryState>(3).fill("READY_FOR_REASSESSMENT"),
  ...Array<MasteryState>(4).fill("DEVELOPING"),
  ...Array<MasteryState>(4).fill("GAP"),
  ...Array<MasteryState>(15).fill("UNASSESSED"),
];

function stateFor(state: MasteryState) {
  switch (state) {
    case "MASTERED":
      return (
        <>
          <Fold />
          <StateWord tone="earned">متقنة</StateWord>
        </>
      );
    case "READY_FOR_REASSESSMENT":
      return <StateWord tone="ready">جاهزة</StateWord>;
    case "GAP":
      return <StateWord tone="gap">فجوة</StateWord>;
    default:
      return (
        <>
          <Fold state="provisional" />
          <StateWord tone="provisional">مبدئي</StateWord>
        </>
      );
  }
}

export function SampleSkillMap() {
  const measured = sampleTiles.filter((state) => state !== "UNASSESSED").length;
  return (
    <figure className="sample-profile" aria-labelledby="sample-profile-title">
      <div className="sample-profile__head">
        <p id="sample-profile-title">ملف مهاراتك · القدرات العامة</p>
        <span className="sample-tag">مثال توضيحي</span>
      </div>
      <ul className="skill-rows">
        {sample.map((row) => (
          <SkillRow
            key={row.skill}
            name={row.skill}
            state={stateFor(row.state)}
            meta={`${row.answered} سؤالاً`}
            share={row.correct / row.answered}
            figure={`${row.correct}/${row.answered}`}
          />
        ))}
      </ul>
      <figcaption className="sample-profile__foot">
        <span>
          <strong>{`${measured} من ${sampleTiles.length}`}</strong> مهارة قيست، واحدة منها أثبتّ
          إتقانها
        </span>
        <Tiles
          states={sampleTiles}
          label="مثال: مهارة متقنة، 4 جاهزة، 5 قيد التحسّن، 6 فجوات، 15 لم تُقس"
        />
      </figcaption>
    </figure>
  );
}
