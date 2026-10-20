import { Inject, Injectable } from "@nestjs/common";

import type { ActorContext } from "../../../common/actor.js";
import {
  CATALOG_LOOKUP,
  type CatalogLookup,
  type TaxonomyOutline,
} from "../../catalog/catalog.contract.js";
import {
  BlueprintDomainUnknown,
  BlueprintExamNotFound,
  BlueprintNeedsPublishedTaxonomy,
  BlueprintNotEditable,
  BlueprintNotFound,
  BlueprintTaxonomyNotPublished,
} from "../domain/assessment.errors.js";
import {
  assertEditable,
  type Blueprint,
  type DiagnosticBlueprintType,
  effectiveDomainWeights,
} from "../domain/blueprint.js";
import { BLUEPRINT_STORE, type BlueprintChanges, type BlueprintStore } from "../domain/ports.js";

/** A blueprint with the taxonomy it is pinned to, as an admin edits it. */
export interface BlueprintDetail {
  blueprint: Blueprint;
  taxonomyVersion: TaxonomyOutline["version"];
  domains: { id: string; name: string; taxonomyWeight: number; weight: number | null }[];
}

/**
 * Diagnostic blueprints (B2): an admin sizes and weights each diagnostic of an
 * exam. Sessions reference blueprints, so only drafts change; activation
 * replaces the live recipe atomically.
 */
@Injectable()
export class BlueprintsService {
  constructor(
    @Inject(BLUEPRINT_STORE) private readonly store: BlueprintStore,
    @Inject(CATALOG_LOOKUP) private readonly catalog: CatalogLookup,
  ) {}

  async list(examId: string): Promise<Blueprint[]> {
    if ((await this.catalog.examStatus(examId)) === null) throw new BlueprintExamNotFound();
    return this.store.listForExam(examId);
  }

  async get(blueprintId: string): Promise<BlueprintDetail> {
    return this.detail(await this.found(blueprintId));
  }

  /** A draft pinned to the exam's published taxonomy version. */
  async create(
    examId: string,
    input: { type: DiagnosticBlueprintType; code: string; name: string; questionCount: number },
  ): Promise<BlueprintDetail> {
    if ((await this.catalog.examStatus(examId)) === null) throw new BlueprintExamNotFound();
    const taxonomy = await this.catalog.publishedTaxonomy(examId);
    if (!taxonomy) throw new BlueprintNeedsPublishedTaxonomy();
    return this.detail(
      await this.store.create({ ...input, examId, taxonomyVersionId: taxonomy.taxonomyVersionId }),
    );
  }

  async update(blueprintId: string, changes: BlueprintChanges): Promise<BlueprintDetail> {
    const blueprint = await this.found(blueprintId);
    assertEditable(blueprint.status);
    if (changes.domainWeights) {
      const outline = await this.outline(blueprint);
      const known = new Set(outline.domains.map((d) => d.id));
      const merged = new Map(blueprint.domainWeights);
      for (const [domainId, weight] of changes.domainWeights) {
        if (!known.has(domainId)) throw new BlueprintDomainUnknown();
        if (weight === null) merged.delete(domainId);
        else merged.set(domainId, weight);
      }
      effectiveDomainWeights(outline.domains, merged);
    }
    const updated = await this.store.updateDraft(blueprintId, changes);
    if (!updated) throw new BlueprintNotEditable(await this.statusOf(blueprintId));
    return this.detail(updated);
  }

  async activate(blueprintId: string, actor: ActorContext): Promise<BlueprintDetail> {
    const blueprint = await this.found(blueprintId);
    if (blueprint.status === "ACTIVE") return this.detail(blueprint);
    assertEditable(blueprint.status);
    if ((await this.catalog.versionStatus(blueprint.taxonomyVersionId)) !== "PUBLISHED") {
      throw new BlueprintTaxonomyNotPublished();
    }
    effectiveDomainWeights((await this.outline(blueprint)).domains, blueprint.domainWeights);

    const activated = await this.store.activate(blueprintId, actor);
    if (!activated) throw new BlueprintNotEditable(await this.statusOf(blueprintId));
    return this.detail(activated);
  }

  async archive(blueprintId: string, actor: ActorContext): Promise<BlueprintDetail> {
    const blueprint = await this.found(blueprintId);
    if (blueprint.status === "ARCHIVED") return this.detail(blueprint);
    return this.detail(await this.store.archive(blueprintId, actor));
  }

  private async found(blueprintId: string): Promise<Blueprint> {
    const blueprint = await this.store.find(blueprintId);
    if (!blueprint) throw new BlueprintNotFound();
    return blueprint;
  }

  private async statusOf(blueprintId: string): Promise<string> {
    return (await this.found(blueprintId)).status;
  }

  private async outline(blueprint: Blueprint): Promise<TaxonomyOutline> {
    const outline = await this.catalog.activeOutline(blueprint.taxonomyVersionId);
    if (!outline) throw new Error(`Blueprint ${blueprint.id}'s taxonomy version is missing.`);
    return outline;
  }

  private async detail(blueprint: Blueprint): Promise<BlueprintDetail> {
    const outline = await this.outline(blueprint);
    return {
      blueprint,
      taxonomyVersion: outline.version,
      domains: outline.domains.map((d) => ({
        id: d.id,
        name: d.name,
        taxonomyWeight: d.weight,
        weight: blueprint.domainWeights.get(d.id) ?? null,
      })),
    };
  }
}
