import { afterAll, describe, expect, it } from "vitest";

import { expectRejected, firstRow, SqlState, testSql, withRollback } from "./support/db.js";

afterAll(() => testSql.end());

type IdRow = { id: string };

// SECURITY.md / OBSERVABILITY.md — the audit log is a durable security record.
describe("audit log", () => {
  it("cannot be edited, deleted or truncated", () =>
    withRollback(async (tx) => {
      const entry = firstRow(
        await tx<IdRow[]>`
          INSERT INTO audit_logs (action, resource_type) VALUES ('question.publish', 'question')
          RETURNING id`,
      );

      await expectRejected(
        tx,
        SqlState.restrictViolation,
        (sp) => sp`UPDATE audit_logs SET action = 'tampered' WHERE id = ${entry.id}`,
      );
      await expectRejected(
        tx,
        SqlState.restrictViolation,
        (sp) => sp`DELETE FROM audit_logs WHERE id = ${entry.id}`,
      );
      await expectRejected(tx, SqlState.restrictViolation, (sp) => sp`TRUNCATE audit_logs`);
    }));

  it("keeps the record but detaches the actor when that user is deleted", () =>
    withRollback(async (tx) => {
      const actor = firstRow(
        await tx<IdRow[]>`INSERT INTO users (display_name) VALUES ('test-admin') RETURNING id`,
      );
      const entry = firstRow(
        await tx<IdRow[]>`
          INSERT INTO audit_logs (actor_id, action, resource_type)
          VALUES (${actor.id}, 'role.grant', 'user') RETURNING id`,
      );

      // ON DELETE SET NULL must pass through the append-only guard.
      await tx`DELETE FROM users WHERE id = ${actor.id}`;

      const row = firstRow(
        await tx<{ actor_id: string | null; action: string }[]>`
          SELECT actor_id, action FROM audit_logs WHERE id = ${entry.id}`,
      );
      expect(row).toEqual({ actor_id: null, action: "role.grant" });
    }));
});

describe("updated_at", () => {
  it("is set by the database on every update, not only by the ORM", () =>
    withRollback(async (tx) => {
      const user = firstRow(
        await tx<IdRow[]>`
          INSERT INTO users (display_name, updated_at)
          VALUES ('test-user', '2000-01-01T00:00:00Z') RETURNING id`,
      );

      // Raw SQL that does not mention updated_at at all.
      const row = firstRow(
        await tx<{ updated_at: Date }[]>`
          UPDATE users SET display_name = 'renamed' WHERE id = ${user.id} RETURNING updated_at`,
      );
      expect(row.updated_at.getUTCFullYear()).toBeGreaterThan(2000);
    }));
});
