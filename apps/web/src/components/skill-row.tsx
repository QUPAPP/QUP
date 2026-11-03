import type { CSSProperties, ReactNode } from "react";

const TICKS = 10;

/** Ten 45° ticks, filled from the start edge in proportion to `share` (0–1). */
export function Ticks({ share }: { share: number }) {
  const filled = Math.round(Math.min(1, Math.max(0, share)) * TICKS);
  return (
    <span className="ticks" aria-hidden="true">
      {Array.from({ length: TICKS }, (_, index) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: ticks are positions, not items
          key={index}
          className="ticks__tick"
          data-on={index < filled || undefined}
          style={{ "--i": index } as CSSProperties}
        />
      ))}
    </span>
  );
}

/**
 * One skill on one line: an optional rank, the name with its written state,
 * then the measure (ticks and a figure). Callers pass the state chip so the
 * row never decides what a state means.
 */
export function SkillRow({
  name,
  state,
  meta,
  share,
  figure,
  rank,
}: {
  name: string;
  state?: ReactNode;
  meta?: string;
  share?: number | null;
  figure?: string;
  rank?: number;
}) {
  return (
    <li className="skill-row" data-ranked={rank === undefined ? undefined : true}>
      {rank === undefined ? null : <span className="skill-row__rank">{rank}</span>}
      <span className="skill-row__name">
        <strong>{name}</strong>
        {state}
        {meta ? <small>{meta}</small> : null}
      </span>
      {share === undefined || share === null ? <span /> : <Ticks share={share} />}
      {figure ? <bdi className="skill-row__figure">{figure}</bdi> : <span />}
    </li>
  );
}

export type StateTone = "earned" | "provisional" | "ready" | "gap" | "muted";

/** The written state beside a skill name. Colour follows the word, never replaces it. */
export function StateWord({ tone, children }: { tone: StateTone; children: ReactNode }) {
  return (
    <span className="state-word" data-tone={tone}>
      {children}
    </span>
  );
}
