import { randomInt } from "node:crypto";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import postgres from "postgres";

/**
 * Database access for end-to-end API tests.
 *
 * HTTP requests use their own pooled connections, so these tests cannot hide
 * inside one rolled-back transaction the way the @qup/db tests do. Instead,
 * every identifier they create lives in a reserved namespace and is deleted
 * before and after the run:
 *   - emails on the reserved `.test` TLD: *@e2e.qup.test
 *   - phones under +999, a country code the ITU has not assigned: +99912…
 * Only synthetic data — never real personal data.
 */

const localEnvFile = fileURLToPath(new URL("../../../../.env", import.meta.url));
if (existsSync(localEnvFile)) process.loadEnvFile(localEnvFile);

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is required to run end-to-end API tests.");

export const E2E_DATABASE_URL = url;
export const e2eSql = postgres(url, { max: 2, onnotice: () => {} });

const E2E_EMAIL_DOMAIN = "e2e.qup.test";
const E2E_PHONE_PREFIX = "+99912";
const PHONE_SUFFIX_DIGITS = 7;

export function e2eEmail(label: string): string {
  return `${label}-${randomInt(1_000_000_000)}@${E2E_EMAIL_DOMAIN}`;
}

export function e2ePhone(): string {
  return `${E2E_PHONE_PREFIX}${String(randomInt(10 ** PHONE_SUFFIX_DIGITS)).padStart(PHONE_SUFFIX_DIGITS, "0")}`;
}

/**
 * Deletes test users. Sessions and role grants cascade with the user.
 *
 * Audit entries about them (role grants) are removed first, in a separate
 * transaction: the audit log is append-only by trigger, and disabling triggers
 * (see purgeE2eCatalog) would also disable the FK cascades the user delete
 * relies on. TEST CLEANUP ONLY.
 */
export async function deleteE2eUsers(): Promise<void> {
  const matches = e2eSql`email LIKE ${`%@${E2E_EMAIL_DOMAIN}`} OR phone LIKE ${`${E2E_PHONE_PREFIX}%`}`;
  const ids = (await e2eSql<{ id: string }[]>`SELECT id FROM users WHERE ${matches}`).map(
    (r) => r.id,
  );
  await deleteE2eUsersById(ids);
}

/**
 * deleteE2eUsers for accounts found by id — an erased account has no email or
 * phone left to match. TEST CLEANUP ONLY.
 */
export async function deleteE2eUsersById(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;

  // Their import batches (items cascade) and events — before the users, whose deletion would orphan them.
  await e2eSql`
    DELETE FROM outbox_events WHERE aggregate_type = 'import_batch' AND aggregate_id IN (
      SELECT id::text FROM import_batches WHERE uploaded_by IN ${e2eSql(ids)})`;
  await e2eSql`DELETE FROM import_batches WHERE uploaded_by IN ${e2eSql(ids)}`;
  await e2eSql`DELETE FROM learning_events WHERE student_id IN ${e2eSql(ids)}`;
  // Mail owed to, and logged for, test accounts (the user FK only nulls the log's link).
  await e2eSql`
    DELETE FROM email_deliveries
    WHERE to_address LIKE ${`%@${E2E_EMAIL_DOMAIN}`} OR user_id IN ${e2eSql(ids)}`;
  await e2eSql`
    DELETE FROM outbox_events
    WHERE event_type = 'notification.email.requested' AND payload->>'userId' IN ${e2eSql(ids)}`;
  await e2eSql`DELETE FROM ai_runs WHERE requested_by IN ${e2eSql(ids)}`;
  // Rows only: the files are in the test run's temporary storage directory.
  await e2eSql`DELETE FROM question_assets WHERE uploaded_by IN ${e2eSql(ids)}`;
  // Passages their questions no longer point at (the catalog purge removes the questions first).
  await e2eSql`
    DELETE FROM question_passages p WHERE p.created_by IN ${e2eSql(ids)}
      AND NOT EXISTS (SELECT 1 FROM question_versions v WHERE v.passage_id = p.id)`;
  await e2eSql`DELETE FROM question_reports WHERE reported_by IN ${e2eSql(ids)}`;
  await e2eSql.begin(async (tx) => {
    await tx`SET LOCAL session_replication_role = replica`;
    await tx`DELETE FROM audit_logs WHERE resource_type = 'user' AND resource_id IN ${tx(ids)}`;
    // Everything test accounts did (settings saves, publishes…), so the local audit log stays readable.
    await tx`DELETE FROM audit_logs WHERE actor_id IN ${tx(ids)}`;
    // Training decisions name the student; items pointing at them go with their exams.
    await tx`DELETE FROM adaptive_decisions WHERE student_id IN ${tx(ids)}`;
  });
  await e2eSql`DELETE FROM users WHERE id IN ${e2eSql(ids)}`;
}

/** Exam codes reserved for end-to-end tests. */
export const E2E_EXAM_PREFIX = "E2E_";

export function e2eExamCode(): string {
  return `${E2E_EXAM_PREFIX}${randomInt(1_000_000_000)}`;
}

/**
 * Removes exams created by end-to-end tests, with their taxonomy and the audit
 * entries about them.
 *
 * TEST CLEANUP ONLY — never copy this into application code. Published
 * taxonomy versions and audit entries are protected by triggers (0001, 0005)
 * because they are business history. Test fixtures are not, so this disables
 * triggers for its own transaction only (`SET LOCAL`), and touches nothing but
 * rows under the reserved E2E_ exam-code prefix. Requires a superuser, which
 * the development and CI databases use; anything else fails loudly here.
 */
export async function purgeE2eCatalog(): Promise<void> {
  await e2eSql.begin(async (tx) => {
    await tx`SET LOCAL session_replication_role = replica`;
    const examIds = (
      await tx<{ id: string }[]>`
        SELECT id FROM exams WHERE code LIKE ${`${E2E_EXAM_PREFIX}%`}`
    ).map((r) => r.id);
    if (examIds.length === 0) return;

    // Assessment data first: attempts reference question versions, evidence
    // references attempts. mastery_events is append-only by trigger.
    const sessionIds = (
      await tx<{ id: string }[]>`SELECT id FROM assessment_sessions WHERE exam_id IN ${tx(examIds)}`
    ).map((r) => r.id);
    if (sessionIds.length > 0) {
      await tx`DELETE FROM outbox_events WHERE aggregate_id IN ${tx(sessionIds)}`;
      await tx`DELETE FROM skill_reassessments WHERE session_id IN ${tx(sessionIds)}`;
      const itemIds = (
        await tx<
          { id: string }[]
        >`SELECT id FROM assessment_items WHERE session_id IN ${tx(sessionIds)}`
      ).map((r) => r.id);
      if (itemIds.length > 0) {
        const decisionIds = (
          await tx<{ id: string }[]>`
            SELECT adaptive_decision_id AS id FROM assessment_items
            WHERE id IN ${tx(itemIds)} AND adaptive_decision_id IS NOT NULL`
        ).map((r) => r.id);
        if (decisionIds.length > 0) {
          await tx`DELETE FROM adaptive_decisions WHERE id IN ${tx(decisionIds)}`;
        }
        const attemptIds = (
          await tx<{ id: string }[]>`
            SELECT id FROM question_attempts WHERE assessment_item_id IN ${tx(itemIds)}`
        ).map((r) => r.id);
        if (attemptIds.length > 0) {
          await tx`DELETE FROM mastery_events WHERE attempt_id IN ${tx(attemptIds)}`;
          await tx`DELETE FROM question_attempts WHERE id IN ${tx(attemptIds)}`;
        }
        await tx`DELETE FROM assessment_items WHERE id IN ${tx(itemIds)}`;
      }
      await tx`DELETE FROM assessment_sessions WHERE id IN ${tx(sessionIds)}`;
    }
    await tx`DELETE FROM student_mastery_states WHERE exam_id IN ${tx(examIds)}`;
    // AI: the exam's knowledge library (chunks first) and study chats.
    await tx`
      DELETE FROM ai_knowledge_chunks WHERE item_id IN (
        SELECT id FROM ai_knowledge_items WHERE exam_id IN ${tx(examIds)})`;
    await tx`DELETE FROM ai_knowledge_items WHERE exam_id IN ${tx(examIds)}`;
    await tx`DELETE FROM ai_chat_messages WHERE exam_id IN ${tx(examIds)}`;
    const blueprintIds = (
      await tx<{ id: string }[]>`
        SELECT id FROM assessment_blueprints WHERE exam_id IN ${tx(examIds)}`
    ).map((r) => r.id);
    if (blueprintIds.length > 0) {
      await tx`DELETE FROM audit_logs WHERE resource_id IN ${tx(blueprintIds)}`;
      await tx`DELETE FROM blueprint_rules WHERE blueprint_id IN ${tx(blueprintIds)}`;
      await tx`DELETE FROM assessment_blueprints WHERE id IN ${tx(blueprintIds)}`;
    }

    // Billing: a plan covers exams through plan_exams (a bundle covers several);
    // payments and entitlements hang off plans and exams.
    const planIds = (
      await tx<{ id: string }[]>`
        SELECT DISTINCT plan_id AS id FROM plan_exams WHERE exam_id IN ${tx(examIds)}`
    ).map((r) => r.id);
    const billingIds = (
      await tx<{ id: string }[]>`
        SELECT id FROM entitlements WHERE exam_id IN ${tx(examIds)}
        ${
          planIds.length > 0
            ? tx`UNION ALL SELECT id FROM plans WHERE id IN ${tx(planIds)}
        UNION ALL SELECT id FROM payments WHERE plan_id IN ${tx(planIds)}
        UNION ALL SELECT id FROM entitlements WHERE plan_id IN ${tx(planIds)}`
            : tx``
        }`
    ).map((r) => r.id);
    if (billingIds.length > 0) {
      await tx`DELETE FROM audit_logs WHERE resource_id IN ${tx(billingIds)}`;
      // Receipts and refund notices owed for these payments.
      await tx`
        DELETE FROM outbox_events WHERE aggregate_type = 'payment' AND aggregate_id IN ${tx(billingIds)}`;
    }
    await tx`DELETE FROM entitlements WHERE exam_id IN ${tx(examIds)}`;
    if (planIds.length > 0) {
      await tx`DELETE FROM entitlements WHERE plan_id IN ${tx(planIds)}`;
      await tx`DELETE FROM payments WHERE plan_id IN ${tx(planIds)}`;
      // Triggers are off, so the plan_exams cascade does not run: clear it explicitly.
      await tx`DELETE FROM plan_exams WHERE plan_id IN ${tx(planIds)}`;
      await tx`DELETE FROM plans WHERE id IN ${tx(planIds)}`;
    }

    const versionIds = (
      await tx<{ id: string }[]>`SELECT id FROM taxonomy_versions WHERE exam_id IN ${tx(examIds)}`
    ).map((r) => r.id);
    if (versionIds.length > 0) {
      // Questions written against these taxonomies. Triggers are off, so FK
      // cascades do not run either: every child table is cleared explicitly.
      const questionVersionIds = (
        await tx<{ id: string }[]>`
          SELECT id FROM question_versions WHERE taxonomy_version_id IN ${tx(versionIds)}`
      ).map((r) => r.id);
      if (questionVersionIds.length > 0) {
        const questionIds = (
          await tx<{ question_id: string }[]>`
            SELECT DISTINCT question_id FROM question_versions WHERE id IN ${tx(questionVersionIds)}`
        ).map((r) => r.question_id);
        await tx`DELETE FROM content_reviews WHERE question_version_id IN ${tx(questionVersionIds)}`;
        await tx`DELETE FROM question_reports WHERE question_version_id IN ${tx(questionVersionIds)}`;
        await tx`
          DELETE FROM import_items WHERE resulting_question_version_id IN ${tx(questionVersionIds)}`;
        await tx`DELETE FROM question_options WHERE question_version_id IN ${tx(questionVersionIds)}`;
        await tx`
          DELETE FROM question_skill_mappings WHERE question_version_id IN ${tx(questionVersionIds)}`;
        await tx`DELETE FROM audit_logs WHERE resource_id IN ${tx([...questionVersionIds, ...questionIds])}`;
        await tx`
          DELETE FROM ai_runs
          WHERE subject_type = 'question_version' AND subject_id IN ${tx(questionVersionIds)}`;
        await tx`DELETE FROM question_versions WHERE id IN ${tx(questionVersionIds)}`;
        await tx`DELETE FROM questions WHERE id IN ${tx(questionIds)}`;
      }

      const domainIds = (
        await tx<{ id: string }[]>`
          SELECT id FROM domains WHERE taxonomy_version_id IN ${tx(versionIds)}`
      ).map((r) => r.id);
      const skillIds = domainIds.length
        ? (
            await tx<{ id: string }[]>`SELECT id FROM skills WHERE domain_id IN ${tx(domainIds)}`
          ).map((r) => r.id)
        : [];
      if (skillIds.length > 0) {
        await tx`DELETE FROM skill_prerequisites WHERE skill_id IN ${tx(skillIds)}`;
        await tx`DELETE FROM subskills WHERE skill_id IN ${tx(skillIds)}`;
        await tx`DELETE FROM skills WHERE id IN ${tx(skillIds)}`;
      }
      if (domainIds.length > 0) await tx`DELETE FROM domains WHERE id IN ${tx(domainIds)}`;
      await tx`DELETE FROM audit_logs WHERE resource_id IN ${tx(versionIds)}`;
      await tx`DELETE FROM taxonomy_versions WHERE id IN ${tx(versionIds)}`;
    }
    await tx`DELETE FROM exams WHERE id IN ${tx(examIds)}`;
  });
}

export async function grantRole(userId: string, roleCode: string): Promise<void> {
  await e2eSql`
    INSERT INTO user_roles (user_id, role_id)
    SELECT ${userId}, id FROM roles WHERE code = ${roleCode}`;
}
