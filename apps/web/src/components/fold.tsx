/**
 * The gold fold from the logo: the one mark of proven mastery (UI_BRAND.md,
 * "Gold is earned"). "earned" is solid gold and only for a skill the engine
 * marked MASTERED; "provisional" is an outline for thin evidence. It always
 * sits beside a written state, because gold on white is not enough alone.
 */
export function Fold({ state = "earned" }: { state?: "earned" | "provisional" }) {
  return (
    <svg
      className="fold"
      data-state={state}
      width="28"
      height="14"
      viewBox="0 0 28 14"
      aria-hidden="true"
    >
      <polygon points="1,1 14,1 27,13 14,13" />
    </svg>
  );
}
