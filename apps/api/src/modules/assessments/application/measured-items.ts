import type { CatalogLookup } from "../../catalog/catalog.contract.js";
import type { QuestionReader } from "../../questions/questions.contract.js";
import type { SessionItem } from "../domain/ports.js";
import type { ItemOutcome, MeasuredItem } from "../domain/preliminary-result.js";

function outcomeOf(item: SessionItem): ItemOutcome {
  if (item.attempt?.resultType !== "ANSWERED") return "NOT_ANSWERED";
  return item.attempt.isCorrect ? "CORRECT" : "INCORRECT";
}

/**
 * Each item as the skill it reports to and how it went: a question mapped to
 * a subskill reports to the subskill's skill. Results show skills, never the
 * answer key.
 */
export async function measureItems(
  items: readonly SessionItem[],
  deps: { questions: QuestionReader; catalog: CatalogLookup },
): Promise<{ measured: MeasuredItem[]; skillNames: Map<string, string> }> {
  const targets = await deps.questions.primaryTargetsOf(items.map((i) => i.questionVersionId));
  const nodes = [...targets.values()];
  const reporting = await deps.catalog.reportingSkills({
    skillIds: nodes.flatMap((n) => (n.skillId ? [n.skillId] : [])),
    subskillIds: nodes.flatMap((n) => (n.subskillId ? [n.subskillId] : [])),
  });

  const skillNames = new Map<string, string>();
  const measured = items.map((item) => {
    const target = targets.get(item.questionVersionId);
    const skill = target?.skillId
      ? reporting.skills.get(target.skillId)
      : reporting.subskills.get(target?.subskillId ?? "");
    if (!skill) throw new Error(`Item ${item.id} measures no skill of the taxonomy.`);
    skillNames.set(skill.id, skill.name);
    return { skillId: skill.id, outcome: outcomeOf(item) };
  });
  return { measured, skillNames };
}
