import type { AiCompletion, AiCompletionRequest, AiProvider } from "./provider.js";
import { correctKeys, type ExplanationDraftInput } from "./tasks/explanation.js";
import type { MistakeExplanationInput } from "./tasks/mistake-explanation.js";
import type { QuestionDraftInput } from "./tasks/question-draft.js";
import type {
  MetadataSuggestion,
  MetadataSuggestionInput,
  SuggestedDifficulty,
} from "./tasks/question-metadata.js";

/** How the next call should misbehave, for tests of the gateway's fallbacks. */
export type FakeFailure = "invalid-json" | "wrong-answer" | "timeout" | "error";

export const FAKE_MODEL = "fake-v1";

/** A rough token count for the run record; real providers report their own. */
const CHARS_PER_TOKEN = 4;
/** Stem lengths (characters) under which the fake calls a question easy, then medium. */
const EASY_STEM_CHARS = 60;
const MEDIUM_STEM_CHARS = 160;
const LABEL = "مزوّد الاختبار (ليس نموذجًا حقيقيًا)";

function tokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function waitForAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) reject(signal.reason);
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

function suggestMetadata(input: MetadataSuggestionInput, wrong: boolean): MetadataSuggestion {
  const named = input.nodes
    .map((node) => ({
      node,
      word: node.name
        .split("›")
        .map((part) => part.trim())
        .find((part) => part !== "" && input.question.stem.includes(part)),
    }))
    .find((match) => match.word !== undefined);
  const node = named?.node ?? input.nodes[0];
  const length = input.question.stem.length;
  const difficulty: SuggestedDifficulty =
    length < EASY_STEM_CHARS ? "EASY" : length < MEDIUM_STEM_CHARS ? "MEDIUM" : "HARD";
  const reason = named
    ? `نص السؤال يذكر «${named.word}».`
    : "لم يُذكر اسم مهارة في النص، فاختيرت أول مهارة في القائمة.";
  return {
    nodeId: wrong || !node ? "not-a-listed-node" : node.id,
    difficulty,
    rationale: `${LABEL}: ${reason} والصعوبة مقدّرة من طول النص فقط.`,
  };
}

function draftExplanation(input: ExplanationDraftInput, wrong: boolean) {
  const keys = correctKeys(input.question);
  const wrongKey = input.question.options.find((option) => !option.isCorrect)?.key ?? "?";
  const answers = input.question.options
    .filter((option) => option.isCorrect)
    .map((option) => `(${option.key}) «${option.text}»`)
    .join(" و");
  return {
    correctOptionKeys: wrong ? [wrongKey] : keys,
    explanation: `${LABEL}: الإجابة الصحيحة ${answers}. اكتب الشرح الحقيقي قبل إرسال السؤال للمراجعة.`,
  };
}

function explainMistake(input: MistakeExplanationInput, wrong: boolean) {
  const keys = correctKeys(input.question);
  const wrongKey = input.question.options.find((option) => !option.isCorrect)?.key ?? "?";
  return {
    correctOptionKeys: wrong ? [wrongKey] : keys,
    errorType: "UNKNOWN",
    explanation: `${LABEL}: اخترت (${input.chosenKeys.join("، ")}) والإجابة الصحيحة (${keys.join("، ")}).`,
    tip: input.skillName ? `راجع مهارة «${input.skillName}».` : "أعد قراءة السؤال ببطء.",
  };
}

function draftQuestion(input: QuestionDraftInput, wrong: boolean) {
  const text = (n: number) => `خيار ${n} لمهارة ${input.skillName}`;
  return {
    stem: `${LABEL}: سؤال تجريبي في «${input.skillName}» بصعوبة ${input.difficulty}.`,
    options: [1, 2, 3, 4].map((n, i) => ({
      key: ["A", "B", "C", "D"][i],
      text: wrong ? text(1) : text(n),
    })),
    correctOptionKey: "A",
    explanation: `${LABEL}: الخيار الأول هو الصحيح. اكتب الشرح الحقيقي قبل المراجعة.`,
  };
}

/**
 * A deterministic stand-in for a model (AI_INTEGRATION.md "Evaluation"): the
 * same request always gets the same answer, computed from the task's input.
 * It lets the product and its tests run with no vendor, key or network.
 */
export class FakeAiProvider implements AiProvider {
  readonly name = "fake";
  readonly #failures: FakeFailure[];

  constructor(options: { failures?: readonly FakeFailure[] } = {}) {
    this.#failures = [...(options.failures ?? [])];
  }

  async complete(request: AiCompletionRequest, signal: AbortSignal): Promise<AiCompletion> {
    const failure = this.#failures.shift();
    if (failure === "timeout") return waitForAbort(signal);
    if (failure === "error") throw new Error("The fake provider was told to fail");
    if (signal.aborted) throw signal.reason;
    const text =
      failure === "invalid-json"
        ? "لا أستطيع الإجابة بصيغة JSON الآن."
        : JSON.stringify(this.#answer(request, failure === "wrong-answer"));
    return {
      text,
      model: FAKE_MODEL,
      usage: { inputTokens: tokens(request.system + request.prompt), outputTokens: tokens(text) },
    };
  }

  #answer(request: AiCompletionRequest, wrong: boolean): object {
    // The gateway passes each task its own input type; the task name says which.
    switch (request.task) {
      case "suggest_question_metadata":
        return suggestMetadata(request.input as MetadataSuggestionInput, wrong);
      case "draft_explanation":
        return draftExplanation(request.input as ExplanationDraftInput, wrong);
      case "explain_mistake":
        return explainMistake(request.input as MistakeExplanationInput, wrong);
      case "draft_question":
        return draftQuestion(request.input as QuestionDraftInput, wrong);
      default:
        throw new Error(`The fake provider has no answer for ${request.task}`);
    }
  }
}
