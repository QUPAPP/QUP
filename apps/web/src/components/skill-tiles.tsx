import type { CSSProperties } from "react";
import type { MasteryState, SkillProfile } from "@/lib/api";
import { type SkillStateKey, skillStateSegments, tileState } from "@/lib/dashboard-view";
import { CountUp } from "./count-up";

const ORDER: SkillStateKey[] = ["mastered", "ready", "developing", "gap", "unassessed"];

/** A row of one tile per skill, ordered by state, earned first. */
export function Tiles({ states, label }: { states: MasteryState[]; label: string }) {
  const keys = states.map(tileState).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  return (
    <span
      className="tiles"
      role="img"
      aria-label={label}
      style={{ "--count": keys.length } as CSSProperties}
    >
      {keys.map((key, index) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: tiles of one state are interchangeable
          key={`${key}-${index}`}
          className="tiles__tile"
          data-state={key}
          style={{ "--i": index } as CSSProperties}
        />
      ))}
    </span>
  );
}

/** The legend: every state named with its count, so colour is never alone. */
export function StateLegend({ summary }: { summary: SkillProfile["summary"] }) {
  return (
    <ul className="state-legend">
      {skillStateSegments(summary).map((segment) => (
        <li
          key={segment.key}
          data-state={segment.key}
          data-empty={segment.count === 0 || undefined}
        >
          <span className="state-legend__swatch" aria-hidden="true" />
          <strong>
            <CountUp value={segment.count} />
          </strong>
          <span>{segment.label}</span>
        </li>
      ))}
    </ul>
  );
}

function describe(states: MasteryState[]): string {
  const counts = new Map<SkillStateKey, number>();
  for (const state of states) {
    const key = tileState(state);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const names: Record<SkillStateKey, string> = {
    mastered: "متقنة",
    ready: "جاهزة",
    developing: "قيد التحسّن",
    gap: "فجوات",
    unassessed: "لم تُقس",
  };
  return ORDER.filter((key) => counts.get(key))
    .map((key) => `${counts.get(key)} ${names[key]}`)
    .join("، ");
}

/**
 * Where the student stands: how many skills are measured, then one tile per
 * skill split by domain. Falls back to a single row from the summary when the
 * profile has not loaded.
 */
export function StandingTiles({
  summary,
  domains,
}: {
  summary: SkillProfile["summary"];
  domains?: SkillProfile["domains"];
}) {
  const fallback: MasteryState[] = skillStateSegments(summary).flatMap((segment) =>
    Array.from({ length: segment.count }, () => SEGMENT_STATE[segment.key]),
  );
  return (
    <div className="standing">
      <p className="standing__figure">
        <strong>
          <CountUp value={summary.assessed} />
          <span>/{summary.skills}</span>
        </strong>
        <span>مهارة قيست حتى الآن</span>
      </p>
      <div className="standing__domains">
        {domains?.length ? (
          domains.map((domain) => {
            const states = domain.skills.map((skill) => skill.state);
            const measured = states.filter((state) => state !== "UNASSESSED").length;
            return (
              <div key={domain.id} className="standing__domain">
                <span className="standing__name">{domain.name}</span>
                <Tiles states={states} label={`${domain.name}: ${describe(states)}`} />
                <span className="standing__count">{`${measured} من ${states.length}`}</span>
              </div>
            );
          })
        ) : (
          <div className="standing__domain standing__domain--single">
            <Tiles states={fallback} label={describe(fallback)} />
          </div>
        )}
      </div>
      <StateLegend summary={summary} />
    </div>
  );
}

const SEGMENT_STATE: Record<SkillStateKey, MasteryState> = {
  mastered: "MASTERED",
  ready: "READY_FOR_REASSESSMENT",
  developing: "DEVELOPING",
  gap: "GAP",
  unassessed: "UNASSESSED",
};
