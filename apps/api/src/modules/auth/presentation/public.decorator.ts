import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC = "qup:isPublic";

/**
 * Opts a route out of authentication. Every route requires a session unless it
 * says otherwise (secure by default, AGENTS.md §3) — forgetting a decorator
 * fails closed, not open.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);
