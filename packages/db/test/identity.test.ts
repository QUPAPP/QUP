import { afterAll, describe, expect, it } from "vitest";

import { expectRejected, SqlState, type Tx, testSql, withRollback } from "./support/db.js";

afterAll(() => testSql.end());

const insert = (db: Tx, email: string | null, phone: string | null) => db`
  INSERT INTO users (email, phone, password_hash) VALUES (${email}, ${phone}, 'placeholder')`;

// OPEN_QUESTIONS.md #6 (decided 2026-09-22): sign up with email, phone, or both.
describe("user identifiers", () => {
  it("accepts email only, phone only, or both", () =>
    withRollback(async (tx) => {
      await insert(tx, "only-email@qup.test", null);
      await insert(tx, null, "+966500000001");
      await insert(tx, "both@qup.test", "+966500000002");
    }));

  it("rejects a user with neither an email nor a phone", () =>
    withRollback(async (tx) => {
      await expectRejected(tx, SqlState.checkViolation, (sp) => insert(sp, null, null));
    }));

  it("stores emails normalized, so letter case cannot create a second account", () =>
    withRollback(async (tx) => {
      await expectRejected(tx, SqlState.checkViolation, (sp) =>
        insert(sp, "Mixed.Case@QUP.test", null),
      );
      await expectRejected(tx, SqlState.checkViolation, (sp) =>
        insert(sp, " padded@qup.test", null),
      );
    }));

  it("requires phones in E.164 format", () =>
    withRollback(async (tx) => {
      for (const phone of ["0500000000", "966500000000", "+0500000000", "+9665-0000"]) {
        await expectRejected(tx, SqlState.checkViolation, (sp) => insert(sp, null, phone));
      }
    }));

  it("activates new accounts immediately (no verification step)", () =>
    withRollback(async (tx) => {
      const [row] = await tx<{ status: string }[]>`
        INSERT INTO users (email, password_hash) VALUES ('active@qup.test', 'placeholder')
        RETURNING status`;
      expect(row?.status).toBe("ACTIVE");
    }));
});

// OPEN_QUESTIONS.md #14 (decided 2026-09-22): only ADMIN publishes.
describe("seeded roles and permissions", () => {
  async function permissionsOf(role: string): Promise<string[]> {
    const rows = await testSql<{ code: string }[]>`
      SELECT p.code FROM role_permissions rp
      JOIN roles r ON r.id = rp.role_id
      JOIN permissions p ON p.id = rp.permission_id
      WHERE r.code = ${role} ORDER BY p.code`;
    return rows.map((r) => r.code);
  }

  it("lets a content manager create and review, but not publish", async () => {
    expect(await permissionsOf("CONTENT_MANAGER")).toEqual([
      "questions.create",
      "questions.review",
    ]);
  });

  it("gives publishing to ADMIN only", async () => {
    const rows = await testSql<{ code: string }[]>`
      SELECT r.code FROM role_permissions rp
      JOIN roles r ON r.id = rp.role_id
      JOIN permissions p ON p.id = rp.permission_id
      WHERE p.code = 'questions.publish'`;
    expect(rows.map((r) => r.code)).toEqual(["ADMIN"]);
  });

  it("grants students no administrative permissions", async () => {
    expect(await permissionsOf("STUDENT")).toEqual([]);
  });
});
