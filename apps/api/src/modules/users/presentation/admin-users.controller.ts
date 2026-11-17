import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { FastifyRequest } from "fastify";
import { z } from "zod";

import { actorFrom } from "../../../common/http/actor-context.js";
import { uuidParam } from "../../../common/validation/schemas.js";
import { ZodValidationPipe } from "../../../common/validation/zod-validation.pipe.js";
import { Permission } from "../../rbac/permissions.js";
import { RequirePermissions } from "../../rbac/require-permissions.js";
import { AdminUsersService } from "../application/admin-users.service.js";

const PAGE_MAX = 100;
const DEFAULT_PAGE = 25;
const SEARCH_MAX = 320;
const ROLE_CODES = ["STUDENT", "CONTENT_MANAGER", "ADMIN"] as const;
const STATUSES = ["PENDING_VERIFICATION", "ACTIVE", "SUSPENDED", "DEACTIVATED"] as const;

const listQuery = z.strictObject({
  search: z.string().trim().min(1).max(SEARCH_MAX).optional(),
  role: z.enum(ROLE_CODES).optional(),
  status: z.enum(STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(PAGE_MAX).default(DEFAULT_PAGE),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
});
type ListQuery = z.output<typeof listQuery>;

const rolesBody = z.strictObject({
  roles: z.array(z.enum(ROLE_CODES)).min(1).max(ROLE_CODES.length),
});
type RolesBody = z.output<typeof rolesBody>;

const uuid = new ZodValidationPipe(uuidParam);

/** Accounts and their roles (users.manage). Every change is audited. */
@ApiTags("admin: users")
@RequirePermissions(Permission.UsersManage)
@Controller("admin")
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get("users")
  @ApiOperation({ summary: "Accounts, newest first. Search by email, phone or name." })
  async list(@Query(new ZodValidationPipe(listQuery)) query: ListQuery) {
    const { items, hasMore } = await this.users.list(query);
    return { items, page: { limit: query.limit, offset: query.offset, hasMore } };
  }

  @Get("roles")
  @ApiOperation({ summary: "Every role with the permissions it grants." })
  async roles() {
    return { items: await this.users.roles() };
  }

  @Get("users/:id")
  @ApiOperation({ summary: "One account with its roles." })
  get(@Param("id", uuid) id: string) {
    return this.users.get(id);
  }

  @Put("users/:id/roles")
  @ApiOperation({
    summary: "Replace the account's roles. Not your own; at least one admin stays. Audited.",
  })
  setRoles(
    @Param("id", uuid) id: string,
    @Body(new ZodValidationPipe(rolesBody)) body: RolesBody,
    @Req() request: FastifyRequest,
  ) {
    return this.users.setRoles(id, body.roles, actorFrom(request));
  }

  @Post("users/:id/suspend")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Suspend the account and sign it out everywhere. Audited." })
  suspend(@Param("id", uuid) id: string, @Req() request: FastifyRequest) {
    return this.users.suspend(id, actorFrom(request));
  }

  @Post("users/:id/reactivate")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Let a suspended account sign in again. Audited." })
  reactivate(@Param("id", uuid) id: string, @Req() request: FastifyRequest) {
    return this.users.reactivate(id, actorFrom(request));
  }
}
