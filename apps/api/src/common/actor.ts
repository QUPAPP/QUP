/**
 * Who is performing an action, for audit purposes. Plain data, framework-free,
 * so domain ports can accept it without depending on infrastructure.
 *
 * `userId` is null for system actors, such as the admin bootstrap CLI.
 */
export interface ActorContext {
  userId: string | null;
  requestId: string | null;
}

export const SYSTEM_ACTOR: ActorContext = { userId: null, requestId: null };
