import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { AdminUsersService } from "./application/admin-users.service.js";
import { ADMIN_USER_STORE } from "./domain/ports.js";
import { DrizzleAdminUserStore } from "./infrastructure/drizzle-admin-user-store.js";
import { AdminUsersController } from "./presentation/admin-users.controller.js";

@Module({
  // ACCOUNT_ERASURE: the auth module owns what erasing an account touches.
  imports: [AuthModule],
  controllers: [AdminUsersController],
  providers: [AdminUsersService, { provide: ADMIN_USER_STORE, useClass: DrizzleAdminUserStore }],
})
export class UsersModule {}
