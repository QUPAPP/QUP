import { Body, Controller, Get, Param, Put, Req } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { FastifyRequest } from "fastify";
import { z } from "zod";

import { actorFrom } from "../../../common/http/actor-context.js";
import { ZodValidationPipe } from "../../../common/validation/zod-validation.pipe.js";
import { Permission } from "../../rbac/permissions.js";
import { RequirePermissions } from "../../rbac/require-permissions.js";
import { SettingsService, type SettingVersion } from "../application/settings.service.js";
import { SETTING_DEFINITIONS } from "../domain/setting-definitions.js";

const updateSettingBody = z.strictObject({
  expectedVersion: z.number().int().min(0),
  // Validated against the key's own schema by the service (setting-definitions.ts).
  value: z.unknown(),
});
type UpdateSettingBody = z.output<typeof updateSettingBody>;

function toView(setting: SettingVersion) {
  return {
    key: setting.key,
    description: SETTING_DEFINITIONS[setting.key].description,
    valueType: SETTING_DEFINITIONS[setting.key].valueType,
    version: setting.version,
    value: setting.value,
    updatedAt: setting.updatedAt?.toISOString() ?? null,
    updatedBy: setting.updatedBy,
  };
}

/** Versioned system settings. ADMIN only (settings.manage, migration 0011). */
@ApiTags("admin: settings")
@RequirePermissions(Permission.SettingsManage)
@Controller("admin/settings")
export class AdminSettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @ApiOperation({ summary: "Every setting at its current version (0 = the default)." })
  async list() {
    return { items: (await this.settings.list()).map(toView) };
  }

  @Get(":key/versions")
  @ApiOperation({ summary: "A setting's versions, newest first, ending with the default (0)." })
  async history(@Param("key") key: string) {
    return { items: (await this.settings.history(key)).map(toView) };
  }

  @Put(":key")
  @ApiOperation({ summary: "Save the next version. Refused if expectedVersion is stale." })
  async update(
    @Param("key") key: string,
    @Body(new ZodValidationPipe(updateSettingBody)) body: UpdateSettingBody,
    @Req() request: FastifyRequest,
  ) {
    return toView(
      await this.settings.update(key, body.expectedVersion, body.value, actorFrom(request)),
    );
  }
}
