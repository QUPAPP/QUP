import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { createdAt, primaryKeyId, updatedAt, userStatusEnum, whereNotNull } from "./_shared.js";

/**
 * Identity & RBAC.
 *
 * Sign-up decision (OPEN_QUESTIONS.md #6, 2026-09-22): a user registers with an
 * email, a phone, or both, and signs in with either. There is no OTP or
 * ownership verification, so accounts are ACTIVE on creation and the
 * *_verified_at columns stay NULL until a verification flow exists.
 *
 * Identifiers are stored normalized so uniqueness is meaningful:
 *   - email: trimmed and lower-cased ("A@x.com" and "a@x.com" are one account);
 *   - phone: E.164 ("+9665XXXXXXXX").
 */

/** E.164: "+", country code not starting with 0, 8–15 digits in total. */
const E164_PATTERN = "^\\+[1-9][0-9]{7,14}$";

export const users = pgTable(
  "users",
  {
    id: primaryKeyId(),
    email: text("email"),
    phone: text("phone"),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name"),
    status: userStatusEnum("status").notNull().default("ACTIVE"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true, mode: "date" }),
    phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true, mode: "date" }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    // Partial unique: many rows may have NULL email, but a present email is unique.
    uniqueIndex("users_email_unique").on(table.email).where(whereNotNull("email")),
    uniqueIndex("users_phone_unique").on(table.phone).where(whereNotNull("phone")),
    index("users_status_idx").on(table.status),
    check("users_has_identifier", sql`${table.email} IS NOT NULL OR ${table.phone} IS NOT NULL`),
    // Without this, "A@x.com" and "a@x.com" would pass the unique index as two accounts.
    check("users_email_normalized", sql`${table.email} = lower(btrim(${table.email}))`),
    check("users_phone_e164", sql`${table.phone} ~ ${sql.raw(`'${E164_PATTERN}'`)}`),
  ],
);

/**
 * SECURITY.md — opaque server-managed sessions. Only the hash is stored, so a
 * database read never yields a usable session token.
 */
export const authSessions = pgTable(
  "auth_sessions",
  {
    id: primaryKeyId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    userAgent: text("user_agent"),
    ipAddress: text("ip_address"),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("auth_sessions_token_hash_unique").on(table.tokenHash),
    index("auth_sessions_user_idx").on(table.userId),
    index("auth_sessions_expires_idx").on(table.expiresAt),
  ],
);

export const roles = pgTable(
  "roles",
  {
    id: primaryKeyId(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("roles_code_unique").on(table.code)],
);

export const permissions = pgTable(
  "permissions",
  {
    id: primaryKeyId(),
    code: text("code").notNull(),
    description: text("description"),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("permissions_code_unique").on(table.code)],
);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    grantedBy: uuid("granted_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.roleId] }),
    index("user_roles_role_idx").on(table.roleId),
  ],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.roleId, table.permissionId] }),
    index("role_permissions_permission_idx").on(table.permissionId),
  ],
);

/* -------------------------------------------------------------------------- */

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(authSessions),
  roles: many(userRoles),
}));

export const authSessionsRelations = relations(authSessions, ({ one }) => ({
  user: one(users, { fields: [authSessions.userId], references: [users.id] }),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  users: many(userRoles),
  permissions: many(rolePermissions),
}));

export const permissionsRelations = relations(permissions, ({ many }) => ({
  roles: many(rolePermissions),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, { fields: [userRoles.userId], references: [users.id] }),
  role: one(roles, { fields: [userRoles.roleId], references: [roles.id] }),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
  permission: one(permissions, {
    fields: [rolePermissions.permissionId],
    references: [permissions.id],
  }),
}));
