import type { ActorContext } from "../../common/actor.js";
import type { EraseRefusal } from "./domain/ports.js";

/**
 * Public read contract of accounts (AGENTS.md §5), for screens that name who
 * did something — the audit log. Contact details go to admins only, behind
 * their own permission.
 */
export interface DirectoryEntry {
  id: string;
  email: string | null;
  phone: string | null;
  displayName: string | null;
}

export interface UserDirectory {
  /** Ids that do not exist are absent from the map. */
  describe(
    userIds: readonly string[],
  ): Promise<Map<string, { email: string | null; displayName: string | null }>>;
  findByIdentifier(identifier: string): Promise<DirectoryEntry | null>;
  /** Accounts opened since the time, of every role (the funnel's first step). */
  registeredSince(since: Date): Promise<number>;
}

export const USER_DIRECTORY = Symbol("USER_DIRECTORY");

/**
 * Erasing an account (privacy policy, "الإتلاف"), for the admin screen that acts
 * on a person's request. The auth module owns what an erasure touches.
 */
export interface AccountErasure {
  erase(userId: string, actor: ActorContext): Promise<"ERASED" | EraseRefusal>;
}

export const ACCOUNT_ERASURE = Symbol("ACCOUNT_ERASURE");
