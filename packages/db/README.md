# @qup/db

PostgreSQL schema, migrations and integration tests for QUP.
Source of truth: [ERD.md](../../ERD.md), [DOMAIN_MODEL.md](../../DOMAIN_MODEL.md),
[ADAPTIVE_ENGINE.md](../../ADAPTIVE_ENGINE.md).

## Setup

Copy `.env.example` to `.env` at the repo root and fill in:

- `DATABASE_URL` — the QUP CranL development database (dashboard → `qup-db` → Overview → **External**).
- `TEST_DATABASE_URL` — database for integration tests. Every test runs in a transaction that is
  always rolled back, so the dev database is safe to use locally.

## Commands (from the repo root)

| Command            | What it does                                                                        |
| ------------------ | ----------------------------------------------------------------------------------- |
| `pnpm db:generate` | Generate a migration from schema changes in `src/schema/`.                          |
| `pnpm db:check`    | Check migration metadata consistency.                                               |
| `pnpm db:migrate`  | Apply pending migrations. Refuses to run unless the target database is `qup_db`.   |
| `pnpm db:verify`   | Read-only: confirm the live schema matches the committed migrations.                |
| `pnpm test`        | Integration tests that prove the invariants below by trying to break them.         |

## Rules

- Every schema change goes through a migration. Never `drizzle-kit push`.
- Review the generated SQL before applying it. A failed migration is fixed forward — never reset
  the database to get past it.
- Custom SQL (triggers, functions) goes in a `drizzle-kit generate --custom` migration.

## Database-enforced invariants

The application enforces these too; the database is the layer that still holds when a bug or a
manual query bypasses it.

| Invariant                                                   | Enforced by                                    |
| ----------------------------------------------------------- | ---------------------------------------------- |
| One attempt per assessment item                             | unique `question_attempts.assessment_item_id` |
| Same attempt + learning node → one mastery event            | unique index with `COALESCE` over node columns |
| Mastery events and audit logs are append-only               | triggers (`0001_db_guards`)                    |
| Question content changes only in DRAFT; lifecycle is enforced | triggers on versions, options, mappings (`0007`) |
| A published version has a correct option and one PRIMARY mapping | trigger at publish (`0007`)                 |
| Mappings target the version's own taxonomy                  | trigger (`0007`)                               |
| One version in progress and one published per question      | partial unique indexes (`0006`)                |
| Mappings and mastery rows target exactly one learning node | `CHECK` constraints                            |
| A payment / entitlement cannot be granted twice             | unique idempotency key / source reference      |
| `updated_at` is maintained for every write path             | `qup_set_updated_at` trigger                   |
| A user has an email or a phone; email lower-case, phone E.164 | `CHECK` constraints (`0002_users_identity_rules`) |
| Roles and permissions exist; only ADMIN may publish         | seed migration `0003_seed_rbac`                |
| One published taxonomy version per exam                     | partial unique index (`0004`)                  |
| A published taxonomy is read-only; versions only move forward | triggers (`0005_taxonomy_guards`)            |
| Prerequisites stay within one taxonomy version              | trigger (`0005_taxonomy_guards`)               |

Guard violations raise SQLSTATE `23001` (`restrict_violation`).
