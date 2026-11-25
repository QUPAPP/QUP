import { DomainError } from "../../../common/errors/domain-error.js";

/** AI is turned off (AI_PROVIDER=disabled), or the provider failed. Authors carry on by hand. */
export class AiUnavailable extends DomainError {
  readonly code = "AI_UNAVAILABLE";
  readonly kind = "UNAVAILABLE";

  constructor() {
    super("AI assistance is not available right now.");
  }
}

/** The model's answers stayed invalid after every attempt; nothing is shown. */
export class AiOutputInvalid extends DomainError {
  readonly code = "AI_OUTPUT_INVALID";
  readonly kind = "UNAVAILABLE";

  constructor() {
    super("AI assistance could not produce a usable suggestion. Try again later.");
  }
}

export class AiTimedOut extends DomainError {
  readonly code = "AI_TIMEOUT";
  readonly kind = "UNAVAILABLE";

  constructor() {
    super("AI assistance took too long to answer. Try again later.");
  }
}

/** Assistance is for the version an author is still writing. */
export class AiRequiresDraft extends DomainError {
  readonly code = "AI_REQUIRES_DRAFT";
  readonly kind = "CONFLICT";

  constructor() {
    super("AI assistance is available for draft versions only.");
  }
}

export class AiQuestionVersionNotFound extends DomainError {
  readonly code = "QUESTION_VERSION_NOT_FOUND";
  readonly kind = "NOT_FOUND";

  constructor() {
    super("The question version does not exist.");
  }
}

/** The version's taxonomy has no active skill to suggest. */
export class AiNoSkills extends DomainError {
  readonly code = "AI_NO_SKILLS";
  readonly kind = "RULE_VIOLATION";

  constructor() {
    super("The question's taxonomy has no active skills to suggest.");
  }
}

/** Student AI is part of the exam's subscription (OPEN_QUESTIONS.md #18). */
export class AiRequiresSubscription extends DomainError {
  readonly code = "AI_REQUIRES_SUBSCRIPTION";
  readonly kind = "FORBIDDEN";

  constructor() {
    super("AI features are available to subscribers of this exam.");
  }
}

/** A student without a subscription used up the free study chat replies. */
export class AiFreeLimitReached extends DomainError {
  readonly code = "AI_FREE_LIMIT_REACHED";
  readonly kind = "FORBIDDEN";

  constructor(readonly limit: number) {
    super(`The ${limit} free study assistant replies are used up. Subscribe to keep going.`);
  }
}

/** The operator turned the study chat off (AI_STUDY_CHAT=false). */
export class AiStudyChatOff extends DomainError {
  readonly code = "AI_STUDY_CHAT_OFF";
  readonly kind = "UNAVAILABLE";

  constructor() {
    super("The study assistant is not available.");
  }
}

/** A student's daily allowance of study chat messages is used up. */
export class AiChatLimitReached extends DomainError {
  readonly code = "AI_CHAT_LIMIT_REACHED";
  readonly kind = "RULE_VIOLATION";

  constructor(readonly limit: number) {
    super(`You can send ${limit} messages to the study assistant a day.`);
  }
}

export class KnowledgeItemNotFound extends DomainError {
  readonly code = "KNOWLEDGE_ITEM_NOT_FOUND";
  readonly kind = "NOT_FOUND";

  constructor() {
    super("The library entry does not exist or is archived.");
  }
}

/** An entry needs some text worth keeping once blank lines are dropped. */
export class KnowledgeContentEmpty extends DomainError {
  readonly code = "KNOWLEDGE_CONTENT_EMPTY";
  readonly kind = "INVALID_INPUT";

  constructor() {
    super("The entry has no text.");
  }
}

/** The product owner has not turned student explanations on (OPEN_QUESTIONS.md #18). */
export class AiStudentExplanationsOff extends DomainError {
  readonly code = "AI_STUDENT_EXPLANATIONS_OFF";
  readonly kind = "UNAVAILABLE";

  constructor() {
    super("Personalised explanations are not available.");
  }
}

/** Explanations are for questions the student got wrong in training, after answering. */
export class AiMistakeNotFound extends DomainError {
  readonly code = "MISTAKE_NOT_FOUND";
  readonly kind = "NOT_FOUND";

  constructor() {
    super("You have no wrong training answer on this question.");
  }
}

/** A student's daily allowance of personalised explanations is used up. */
export class AiDailyLimitReached extends DomainError {
  readonly code = "AI_DAILY_LIMIT_REACHED";
  readonly kind = "RULE_VIOLATION";

  constructor(readonly limit: number) {
    super(`You can ask for ${limit} personalised explanations a day.`);
  }
}

/** The node to draft a question for is not an active skill or subskill of the version. */
export class AiNodeNotFound extends DomainError {
  readonly code = "AI_NODE_NOT_FOUND";
  readonly kind = "NOT_FOUND";

  constructor() {
    super("The skill is not part of this taxonomy version.");
  }
}

/**
 * The student already has a request to the model running. Limits are counted
 * before the model is called, so parallel requests would all pass the same
 * count; one at a time keeps the free trial and daily caps exact.
 */
export class AiRequestInProgress extends DomainError {
  readonly code = "AI_REQUEST_IN_PROGRESS";
  readonly kind = "CONFLICT";

  constructor() {
    super("Your previous request to the assistant is still running. Wait for it to finish.");
  }
}

/** The student is sitting a timed mock exam; the chat opens again when it ends. */
export class AiChatClosedDuringExam extends DomainError {
  readonly code = "AI_CHAT_CLOSED_DURING_EXAM";
  readonly kind = "RULE_VIOLATION";

  constructor() {
    super("The study assistant is closed while your mock exam is running. Finish it first.");
  }
}

/** The platform-wide AI ceiling for 24 hours is used up (setting ai.dailyBudget). */
export class AiDailyBudgetReached extends DomainError {
  readonly code = "AI_DAILY_BUDGET_REACHED";
  readonly kind = "UNAVAILABLE";

  constructor() {
    super("AI assistance is paused for now because today's limit was reached. Try again later.");
  }
}
