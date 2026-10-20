/**
 * Public read contract of accounts (AGENTS.md §5), for screens that name who
 * did something — the audit log. Contact details go to admins only, behind
 * their own permission.
 */
export interface UserDirectory {
  /** Ids that do not exist are absent from the map. */
  describe(
    userIds: readonly string[],
  ): Promise<Map<string, { email: string | null; displayName: string | null }>>;
}

export const USER_DIRECTORY = Symbol("USER_DIRECTORY");
