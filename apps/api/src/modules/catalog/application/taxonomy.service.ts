import { Inject, Injectable } from "@nestjs/common";

import type { ActorContext } from "../../../common/actor.js";
import {
  ExamNotFound,
  PrerequisiteCycle,
  PrerequisiteOutsideVersion,
  TaxonomyIncomplete,
  TaxonomyNodeNotFound,
  TaxonomyVersionNotDraft,
  TaxonomyVersionNotFound,
} from "../domain/catalog.errors.js";
import {
  CATALOG_STORE,
  type CatalogStore,
  type CreatedNode,
  type DomainChanges,
  type NewDomain,
  type NewPrerequisite,
  type NewSkill,
  type NewSubskill,
  type NodeType,
  type SkillChanges,
  type SubskillChanges,
  type TaxonomyTree,
  type TaxonomyVersion,
} from "../domain/ports.js";
import { wouldCreateCycle } from "../domain/prerequisite-graph.js";

/**
 * Taxonomy authoring (WORKFLOWS.md §9):
 *   Taxonomy Version → Domains → Skills → SubSkills → Weights/Thresholds
 *   → Prerequisites → Validate Cycles → Publish Version
 *
 * Every structural change requires the owning version to be a DRAFT
 * (OPEN_QUESTIONS.md #16b). The check here gives a clear error; the database
 * trigger (0005_taxonomy_guards) is the backstop if anything bypasses it.
 */
@Injectable()
export class TaxonomyService {
  constructor(@Inject(CATALOG_STORE) private readonly store: CatalogStore) {}

  async createVersion(
    examId: string,
    input: { versionCode: string; effectiveFrom: Date | null },
    actor: ActorContext,
  ): Promise<TaxonomyVersion> {
    if (!(await this.store.findExam(examId))) throw new ExamNotFound();
    return this.store.createTaxonomyVersion({ examId, ...input, createdBy: actor.userId });
  }

  async listVersions(examId: string): Promise<TaxonomyVersion[]> {
    if (!(await this.store.findExam(examId))) throw new ExamNotFound();
    return this.store.listTaxonomyVersions(examId);
  }

  async tree(versionId: string): Promise<TaxonomyTree> {
    const tree = await this.store.loadTree(versionId);
    if (!tree) throw new TaxonomyVersionNotFound();
    return tree;
  }

  async createDomain(domain: NewDomain): Promise<CreatedNode> {
    const version = await this.store.findTaxonomyVersion(domain.taxonomyVersionId);
    if (!version) throw new TaxonomyVersionNotFound();
    requireDraft(version);
    return this.store.createDomain(domain);
  }

  async createSkill(skill: NewSkill): Promise<CreatedNode> {
    requireDraft(await this.versionOf("domain", skill.domainId));
    return this.store.createSkill(skill);
  }

  async createSubskill(subskill: NewSubskill): Promise<CreatedNode> {
    requireDraft(await this.versionOf("skill", subskill.skillId));
    return this.store.createSubskill(subskill);
  }

  async updateDomain(domainId: string, changes: DomainChanges): Promise<void> {
    requireDraft(await this.versionOf("domain", domainId));
    await this.store.updateDomain(domainId, changes);
  }

  async updateSkill(skillId: string, changes: SkillChanges): Promise<void> {
    requireDraft(await this.versionOf("skill", skillId));
    await this.store.updateSkill(skillId, changes);
  }

  async updateSubskill(subskillId: string, changes: SubskillChanges): Promise<void> {
    requireDraft(await this.versionOf("subskill", subskillId));
    await this.store.updateSubskill(subskillId, changes);
  }

  async archiveNode(type: NodeType, nodeId: string): Promise<void> {
    requireDraft(await this.versionOf(type, nodeId));
    await this.store.archiveNode(type, nodeId);
  }

  async addPrerequisite(prerequisite: NewPrerequisite): Promise<void> {
    const version = await this.versionOf("skill", prerequisite.skillId);
    const prerequisiteVersion = await this.versionOf("skill", prerequisite.prerequisiteSkillId);
    if (version.id !== prerequisiteVersion.id) throw new PrerequisiteOutsideVersion();
    requireDraft(version);

    await this.store.addPrerequisite(prerequisite, version.id, (edges) => {
      if (wouldCreateCycle(edges, prerequisite.skillId, prerequisite.prerequisiteSkillId)) {
        throw new PrerequisiteCycle();
      }
    });
  }

  async publish(versionId: string, actor: ActorContext): Promise<TaxonomyVersion> {
    const version = await this.store.findTaxonomyVersion(versionId);
    if (!version) throw new TaxonomyVersionNotFound();
    requireDraft(version);

    // Integrity, not policy: a published taxonomy is what diagnostics sample
    // from, so it must contain something to measure in every domain.
    const readiness = await this.store.publishReadiness(versionId);
    if (readiness.activeDomains === 0) throw new TaxonomyIncomplete("it has no active domain.");
    if (readiness.activeSkills === 0) throw new TaxonomyIncomplete("it has no active skill.");
    if (readiness.emptyDomains > 0) {
      throw new TaxonomyIncomplete(
        `${readiness.emptyDomains} active domain(s) have no active skill.`,
      );
    }
    return this.store.publishTaxonomyVersion(version, actor);
  }

  private async versionOf(type: NodeType, nodeId: string): Promise<TaxonomyVersion> {
    const version = await this.store.versionOfNode(type, nodeId);
    if (!version) throw new TaxonomyNodeNotFound(type);
    return version;
  }
}

function requireDraft(version: TaxonomyVersion): void {
  if (version.status !== "DRAFT") throw new TaxonomyVersionNotDraft();
}
