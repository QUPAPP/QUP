import { Inject, Injectable } from "@nestjs/common";

import { SYSTEM_ACTOR } from "../../../common/actor.js";
import {
  AUTH_STORE,
  type AuthStore,
  PASSWORD_HASHER,
  type PasswordHasher,
} from "../domain/ports.js";

/** Already validated at the boundary (the CLI), with the same schema as sign-up. */
export interface AdminBootstrapCommand {
  email?: string | undefined;
  phone?: string | undefined;
  password: string;
}

export type AdminBootstrapOutcome = "created" | "promoted" | "already-admin";

/**
 * Creates the first administrator — there is deliberately no HTTP endpoint for
 * this. Run through the CLI (`pnpm admin:create`) by someone with server access.
 *
 * Idempotent. When an account with the identifier already exists, it is
 * granted ADMIN and its password is left untouched: running the tool must not
 * become a way to take over an existing account by resetting its password.
 */
@Injectable()
export class AdminBootstrapService {
  constructor(
    @Inject(AUTH_STORE) private readonly store: AuthStore,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
  ) {}

  async ensureAdmin(
    command: AdminBootstrapCommand,
  ): Promise<{ userId: string; outcome: AdminBootstrapOutcome }> {
    const existing = command.email
      ? await this.store.findCredentialsByEmail(command.email)
      : command.phone
        ? await this.store.findCredentialsByPhone(command.phone)
        : null;

    if (existing) {
      const granted = await this.store.grantRole(existing.userId, "ADMIN", SYSTEM_ACTOR);
      return { userId: existing.userId, outcome: granted ? "promoted" : "already-admin" };
    }

    const user = await this.store.createAdmin(
      {
        email: command.email ?? null,
        phone: command.phone ?? null,
        passwordHash: await this.hasher.hash(command.password),
        displayName: null,
      },
      SYSTEM_ACTOR,
    );
    return { userId: user.id, outcome: "created" };
  }
}
