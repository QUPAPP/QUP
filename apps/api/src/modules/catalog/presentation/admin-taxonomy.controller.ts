import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { FastifyRequest } from "fastify";

import { actorFrom } from "../../../common/http/actor-context.js";
import { uuidParam } from "../../../common/validation/schemas.js";
import { ZodValidationPipe } from "../../../common/validation/zod-validation.pipe.js";
import { Permission } from "../../rbac/permissions.js";
import { RequirePermissions } from "../../rbac/require-permissions.js";
import { TaxonomyService } from "../application/taxonomy.service.js";
import type { CreatedNode, NodeType, TaxonomyTree } from "../domain/ports.js";
import {
  type AddPrerequisiteBody,
  addPrerequisiteBody,
  type CreateDomainBody,
  type CreateSkillBody,
  type CreateSubskillBody,
  createDomainBody,
  createSkillBody,
  createSubskillBody,
  nodeTypeParam,
  type UpdateDomainBody,
  type UpdateSkillBody,
  type UpdateSubskillBody,
  updateDomainBody,
  updateSkillBody,
  updateSubskillBody,
} from "./catalog.dto.js";
import { type TaxonomyVersionView, toVersionView } from "./catalog.views.js";

/**
 * API_CONTRACTS.md "Taxonomy" and "Exams — Admin" (publish).
 * Class-level permission: every route here requires taxonomy.manage.
 */
@ApiTags("admin: taxonomy")
@RequirePermissions(Permission.TaxonomyManage)
@Controller("admin")
export class AdminTaxonomyController {
  constructor(private readonly taxonomy: TaxonomyService) {}

  @Get("taxonomy-versions/:id/tree")
  @ApiOperation({ summary: "The full tree: domains → skills → subskills, with prerequisites." })
  async tree(
    @Param("id", new ZodValidationPipe(uuidParam)) versionId: string,
  ): Promise<Omit<TaxonomyTree, "version"> & { version: TaxonomyVersionView }> {
    const tree = await this.taxonomy.tree(versionId);
    return { ...tree, version: toVersionView(tree.version) };
  }

  @Post("taxonomy-versions/:id/publish")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Publish a DRAFT version. The exam's previously published version is archived.",
  })
  async publish(
    @Param("id", new ZodValidationPipe(uuidParam)) versionId: string,
    @Req() request: FastifyRequest,
  ): Promise<TaxonomyVersionView> {
    return toVersionView(await this.taxonomy.publish(versionId, actorFrom(request)));
  }

  @Post("domains")
  @HttpCode(HttpStatus.CREATED)
  createDomain(
    @Body(new ZodValidationPipe(createDomainBody)) body: CreateDomainBody,
  ): Promise<CreatedNode> {
    return this.taxonomy.createDomain({
      taxonomyVersionId: body.taxonomyVersionId,
      code: body.code,
      name: body.name,
      description: body.description ?? null,
      weight: body.weight,
      displayOrder: body.displayOrder,
    });
  }

  @Patch("domains/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateDomain(
    @Param("id", new ZodValidationPipe(uuidParam)) domainId: string,
    @Body(new ZodValidationPipe(updateDomainBody)) body: UpdateDomainBody,
  ): Promise<void> {
    await this.taxonomy.updateDomain(domainId, body);
  }

  @Post("skills")
  @HttpCode(HttpStatus.CREATED)
  createSkill(
    @Body(new ZodValidationPipe(createSkillBody)) body: CreateSkillBody,
  ): Promise<CreatedNode> {
    return this.taxonomy.createSkill({
      domainId: body.domainId,
      code: body.code,
      name: body.name,
      description: body.description ?? null,
      weight: body.weight,
      masteryThreshold: body.masteryThreshold ?? null,
      priorityWeight: body.priorityWeight,
      minCoverage: body.minCoverage,
      displayOrder: body.displayOrder,
    });
  }

  @Patch("skills/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateSkill(
    @Param("id", new ZodValidationPipe(uuidParam)) skillId: string,
    @Body(new ZodValidationPipe(updateSkillBody)) body: UpdateSkillBody,
  ): Promise<void> {
    await this.taxonomy.updateSkill(skillId, body);
  }

  @Post("subskills")
  @HttpCode(HttpStatus.CREATED)
  createSubskill(
    @Body(new ZodValidationPipe(createSubskillBody)) body: CreateSubskillBody,
  ): Promise<CreatedNode> {
    return this.taxonomy.createSubskill({
      skillId: body.skillId,
      code: body.code,
      name: body.name,
      description: body.description ?? null,
      weight: body.weight,
      masteryThreshold: body.masteryThreshold ?? null,
      displayOrder: body.displayOrder,
    });
  }

  @Patch("subskills/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateSubskill(
    @Param("id", new ZodValidationPipe(uuidParam)) subskillId: string,
    @Body(new ZodValidationPipe(updateSubskillBody)) body: UpdateSubskillBody,
  ): Promise<void> {
    await this.taxonomy.updateSubskill(subskillId, body);
  }

  @Post("skills/:id/prerequisites")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Declare that a skill requires another. Rejected if it forms a cycle." })
  async addPrerequisite(
    @Param("id", new ZodValidationPipe(uuidParam)) skillId: string,
    @Body(new ZodValidationPipe(addPrerequisiteBody)) body: AddPrerequisiteBody,
  ): Promise<void> {
    await this.taxonomy.addPrerequisite({
      skillId,
      prerequisiteSkillId: body.prerequisiteSkillId,
      importanceWeight: body.importanceWeight,
    });
  }

  @Delete("skills/:id/prerequisites/:prerequisiteSkillId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Remove a prerequisite link from a DRAFT skill. Idempotent." })
  async removePrerequisite(
    @Param("id", new ZodValidationPipe(uuidParam)) skillId: string,
    @Param("prerequisiteSkillId", new ZodValidationPipe(uuidParam)) prerequisiteSkillId: string,
  ): Promise<void> {
    await this.taxonomy.removePrerequisite(skillId, prerequisiteSkillId);
  }

  @Post("nodes/:type/:id/archive")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Archive a domain, skill or subskill (PRD §9: never deleted)." })
  async archive(
    @Param("type", new ZodValidationPipe(nodeTypeParam)) type: NodeType,
    @Param("id", new ZodValidationPipe(uuidParam)) nodeId: string,
  ): Promise<void> {
    await this.taxonomy.archiveNode(type, nodeId);
  }
}
