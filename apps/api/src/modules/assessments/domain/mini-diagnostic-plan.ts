import { apportion } from "./apportion.js";

/**
 * Chooses the questions of a mini diagnostic (PRD §7: "representative
 * coverage, not random first 12"; OPEN_QUESTIONS.md #10a).
 *
 *   1. slots are split across domains by domain weight;
 *   2. each domain's slots are split across its skills by skill weight;
 *   3. within a skill, questions closest to the target difficulty win, with a
 *      random tie-break so students do not all see the same form;
 *   4. items are interleaved across domains so the test does not run in blocks.
 *
 * A domain or skill with too few questions gives its unused share to the
 * others. Pure: randomness is injected, so a seeded source makes it
 * reproducible in tests.
 */

export interface PlanCandidate {
  questionVersionId: string;
  questionId: string;
  difficulty: number;
}

export interface PlanSkill {
  id: string;
  weight: number;
  candidates: readonly PlanCandidate[];
}

export interface PlanDomain {
  id: string;
  weight: number;
  skills: readonly PlanSkill[];
}

export interface PlannedItem extends PlanCandidate {
  domainId: string;
  skillId: string;
}

export function planMiniDiagnostic(input: {
  domains: readonly PlanDomain[];
  size: number;
  targetDifficulty: number;
  /** Returns a float in [0, 1), like Math.random. */
  random: () => number;
}): PlannedItem[] {
  const capacityOf = (skill: PlanSkill) => distinctQuestions(skill.candidates).length;

  const domainSlots = apportion(
    input.size,
    input.domains.map((d) => ({
      key: d.id,
      weight: d.weight,
      capacity: d.skills.reduce((sum, s) => sum + capacityOf(s), 0),
    })),
  );

  const usedQuestions = new Set<string>();
  const perDomain: PlannedItem[][] = [];

  for (const domain of input.domains) {
    const skillSlots = apportion(
      domainSlots.get(domain.id) ?? 0,
      domain.skills.map((s) => ({ key: s.id, weight: s.weight, capacity: capacityOf(s) })),
    );
    const perSkill: PlannedItem[][] = domain.skills.map((skill) =>
      pickClosest(skill, skillSlots.get(skill.id) ?? 0, input, usedQuestions).map((c) => ({
        ...c,
        domainId: domain.id,
        skillId: skill.id,
      })),
    );
    perDomain.push(interleave(perSkill));
  }
  return interleave(perDomain);
}

function pickClosest(
  skill: PlanSkill,
  count: number,
  input: { targetDifficulty: number; random: () => number },
  used: Set<string>,
): PlanCandidate[] {
  const ranked = distinctQuestions(skill.candidates)
    .map((candidate) => ({
      candidate,
      distance: Math.abs(candidate.difficulty - input.targetDifficulty),
      tieBreak: input.random(),
    }))
    .sort((a, b) => a.distance - b.distance || a.tieBreak - b.tieBreak);

  const picked: PlanCandidate[] = [];
  for (const { candidate } of ranked) {
    if (picked.length >= count) break;
    if (used.has(candidate.questionId)) continue;
    used.add(candidate.questionId);
    picked.push(candidate);
  }
  return picked;
}

/** One candidate per logical question: a student never meets the same question twice. */
function distinctQuestions(candidates: readonly PlanCandidate[]): PlanCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((c) => !seen.has(c.questionId) && seen.add(c.questionId));
}

/** Round-robin merge: [[a1,a2],[b1]] → [a1,b1,a2]. */
function interleave<T>(groups: readonly T[][]): T[] {
  const result: T[] = [];
  const longest = Math.max(0, ...groups.map((g) => g.length));
  for (let i = 0; i < longest; i++) {
    for (const group of groups) {
      const item = group[i];
      if (item !== undefined) result.push(item);
    }
  }
  return result;
}
