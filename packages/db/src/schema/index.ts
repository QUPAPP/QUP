/**
 * QUP database schema — full ERD baseline.
 *
 * Source of truth: ERD.md, DOMAIN_MODEL.md, ADAPTIVE_ENGINE.md.
 * Schema changes go through drizzle-kit migrations only; never `push`, never
 * runtime auto-create (AGENTS.md §7).
 */

export * from "./_shared.js";
export * from "./adaptive.js";
export * from "./ai.js";
export * from "./assessment.js";
export * from "./billing.js";
export * from "./identity.js";
export * from "./imports.js";
export * from "./mastery.js";
export * from "./operations.js";
export * from "./questions.js";
export * from "./taxonomy.js";
