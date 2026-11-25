import { Inject, Injectable } from "@nestjs/common";

import type { ActorContext } from "../../../common/actor.js";
import type { ValidationIssue } from "../../../common/validation/zod-validation.pipe.js";
import { type RichContent, richContentAssets } from "../domain/question-content.js";
import { PassageNotFound, QuestionContentInvalid } from "../domain/questions.errors.js";
import {
  PASSAGE_STORE,
  type Passage,
  type PassageStore,
} from "../infrastructure/drizzle-passage-store.js";
import { QuestionAssetsService } from "./question-assets.service.js";

/**
 * Reading passages several questions share (OPEN_QUESTIONS.md #16i). Created
 * once and never edited, so every question version keeps showing exactly what
 * its students read. A passage may hold text, formulas, images and audio
 * (a STEP listening passage several questions are about).
 */
@Injectable()
export class PassagesService {
  constructor(
    @Inject(PASSAGE_STORE) private readonly passages: PassageStore,
    private readonly assets: QuestionAssetsService,
  ) {}

  async create(
    input: { title: string; content: RichContent },
    actor: ActorContext,
  ): Promise<Passage> {
    const references = richContentAssets(input.content, "content");
    const kinds = await this.assets.kindsOf(references.map((r) => r.assetId));
    const problems: ValidationIssue[] = references
      .filter((reference) => kinds.get(reference.assetId) !== reference.kind)
      .map((reference) => ({
        path: reference.path,
        rule: "ASSET_MISSING",
        message: `No uploaded ${reference.kind.toLowerCase()} with this id.`,
      }));
    if (problems.length > 0) throw new QuestionContentInvalid(problems);
    return this.passages.create({ ...input, createdBy: actor.userId });
  }

  async get(passageId: string): Promise<Passage> {
    const passage = await this.passages.find(passageId);
    if (!passage) throw new PassageNotFound();
    return passage;
  }

  list(filter: { search?: string | undefined; limit: number; offset: number }) {
    return this.passages.list(filter);
  }

  async exists(passageId: string): Promise<boolean> {
    return (await this.passages.find(passageId)) !== null;
  }
}
