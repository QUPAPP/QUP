import { Module } from "@nestjs/common";

import { AdminUsersService } from "./application/admin-users.service.js";
import { ADMIN_USER_STORE } from "./domain/ports.js";
import { DrizzleAdminUserStore } from "./infrastructure/drizzle-admin-user-store.js";
import { AdminUsersController } from "./presentation/admin-users.controller.js";

@Module({
  controllers: [AdminUsersController],
  providers: [AdminUsersService, { provide: ADMIN_USER_STORE, useClass: DrizzleAdminUserStore }],
})
export class UsersModule {}
