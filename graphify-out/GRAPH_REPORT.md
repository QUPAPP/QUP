# Graph Report - QUP  (2026-10-27)

## Corpus Check
- 534 files · ~406,834 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 9 file(s) not represented in the graph (top: (none) 2, .toml 1, .example 1)

## Summary
- 4565 nodes · 11608 edges · 204 communities (180 shown, 24 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 349 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `26c4c932`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- api
- Loading
- ErrorNotice
- Database
- questions.service.ts
- assessment.errors.ts
- api.ts
- auth.module.ts
- app.module.ts
- CatalogLookup
- @nestjs/common
- api/package.json
- admin-taxonomy.controller.ts
- assessments.service.ts
- settings/page.tsx
- auth.service.ts
- حالة التنفيذ — 2026-10-21
- lib/permissions.ts
- adaptive-engine/src/index.ts
- AdminGate
- billing.controller.ts
- DrizzleAssessmentStore
- RequirePermissions
- adaptive-selector.service.ts
- [batchId]/page.tsx
- full-reassessment.service.ts
- skill-profile.service.ts
- db.ts
- AGENTS.md — QUP Engineering Agent Contract
- drizzle-catalog-store.ts
- drizzle-question-store.ts
- Principal
- web/package.json
- app-config.ts
- DomainError
- payments.service.ts
- payment-webhooks.controller.ts
- ref_vitest
- verify
- AssessmentsService
- billing/domain/ports.ts
- ActorContext
- plans.service.ts
- SkillProfileService
- e2eSql
- assessment.ts
- QUP — Product Requirements Document v1.0
- api-proxy.ts
- diagnostic-sessions.service.ts
- auth.controller.ts
- DrizzleCatalogStore
- scripts
- ai-assistant.service.ts
- assessments-domain.test.ts
- CatalogStore
- AdminTaxonomyController
- DrizzleCatalogLookup
- tabular.ts
- ai/page.tsx
- ai-gateway/src/index.ts
- imports.service.ts
- row-normaliser.ts
- e2e-database.ts
- db/package.json
- full-reassessment.e2e.test.ts
- QUP Adaptive & Mastery Engine V1
- http.test.ts
- xlsx-reader.ts
- mastery-writer.ts
- Design System: QUP
- admin-forms.ts
- e2eEmail
- environment
- Implementation Plan + Definition of Done
- QuestionsService
- node-form.tsx
- questions.ts
- run.ts
- StudentDashboardService
- BillingStore
- AdminImportsController
- admin-api.ts
- Coding Standards
- 1. Ubiquitous Language
- QUP Logical ERD
- ai-gateway/package.json
- setting-definitions.ts
- AdminBlueprintsController
- DrizzleBillingStore
- stream-provider.test.ts
- DrizzleImportStore
- adaptive-engine/package.json
- _shared.ts
- assessments.controller.ts
- ai/domain/ports.ts
- ImportsService
- QUP API Contracts — V1 Outline
- create-app.ts
- error-mapping.ts
- AdminAiController
- assessments.module.ts
- compilerOptions
- billing-domain.test.ts
- .checkout
- ImportStore
- billing.e2e.test.ts
- createdAt
- verify.ts
- tasks
- AI Integration
- TaxonomyService
- imports.e2e.test.ts
- SKILLS.md — Engineering Skills for QUP Agents
- Testing Strategy
- auth.dto.ts
- compilerOptions
- requiredCorrect
- fake-provider.ts
- identity.ts
- PaymentProvider
- Exam
- DrizzleReassessmentStore
- QuestionBankStats
- AdminSettingsController
- taxonomy-tree.tsx
- QUP Domain Model
- Question Bank & Import System
- AnalyticsService
- AuditReadService
- training.e2e.test.ts
- QUP Architecture
- QUP Production Runbook
- Security Requirements
- QUP Workflows
- @qup/db
- Review Focus
- @qup/api
- QuestionAuthoringController
- What gets built
- compilerOptions
- settings.service.ts
- SettingsService
- full-diagnostic.e2e.test.ts
- prerequisite-panel.tsx
- Deployment — CranL + qupedu.com
- compilerOptions
- compilerOptions
- operations.ts
- taxonomy.ts
- DrizzleQuestionReader
- questions.e2e.test.ts
- Review Focus
- B4 — Skill reassessment and MASTERED
- Observability
- scripts
- OutboxRelay
- EntitlementsService
- AdminImportAnalyticsController
- ai.e2e.test.ts
- assessments.e2e.test.ts
- compilerOptions
- C2 — Outbox worker, metrics and audit screens
- assist-nodes.ts
- catalog.e2e.test.ts
- QUP product
- proxy.ts
- Review Focus
- Review Focus
- Review Focus
- C1 — Versioned system settings (design)
- B2 — Full diagnostic and diagnostic blueprints
- C3 — AI gateway (test provider) and author assistance
- 2. Aggregate Boundaries
- scripts
- 12. Mastery States
- nest-cli.json
- AdminDecisionsController
- SettingsStore
- api/tsconfig.json
- 4. Stack
- Review Focus
- Review Focus
- Assessment
- Exam/Taxonomy
- settings.module.ts
- Provenance
- B1 — Student skill profile (design)
- Question Bank
- Assessments
- DatabaseLifecycle
- QUP interface improvement — 2026-10-17
- Review Focus
- Identity/RBAC
- adaptive-engine/tsconfig.json
- ai-gateway/tsconfig.json
- db/tsconfig.json
- pnpm-workspace.yaml
- backup-restore-check.sh
- healthz/route.ts
- web/AGENTS.md
- DOCUMENTATION_INDEX.md
- .mcp.json

## God Nodes (most connected - your core abstractions)
1. `DomainError` - 120 edges
2. `ErrorNotice()` - 107 edges
3. `@nestjs/common` - 100 edges
4. `api()` - 93 edges
5. `Loading()` - 79 edges
6. `ActorContext` - 77 edges
7. `Icon()` - 74 edges
8. `Database` - 51 edges
9. `next` - 50 edges
10. `PageHeading()` - 50 edges

## Surprising Connections (you probably didn't know these)
- `1. Transactional outbox and worker` --references--> `writeAudit()`  [INFERRED]
  docs/superpowers/specs/2026-10-21-c2-outbox-metrics-audit-design.md → apps/api/src/infrastructure/audit/audit-log.ts
- `API module `ai`` --references--> `AiAssistantService`  [INFERRED]
  docs/superpowers/specs/2026-10-21-c3-ai-gateway-design.md → apps/api/src/modules/ai/application/ai-assistant.service.ts
- `Task 1: Domain, setting and planner` --references--> `planDiagnostic()`  [INFERRED]
  docs/superpowers/plans/2026-10-21-full-reassessment.md → apps/api/src/modules/assessments/domain/diagnostic-plan.ts
- `Testing` --references--> `planDiagnostic()`  [INFERRED]
  docs/superpowers/specs/2026-10-21-b2-full-diagnostic-design.md → apps/api/src/modules/assessments/domain/diagnostic-plan.ts
- `Task 2: Catalog contract — profile taxonomy` --references--> `ProfileTaxonomy`  [INFERRED]
  docs/superpowers/plans/2026-10-21-b1-skill-profile.md → apps/api/src/modules/catalog/catalog.contract.ts

## Import Cycles
- None detected.

## Communities (204 total, 24 thin omitted)

### Community 0 - "api"
Cohesion: 0.04
Nodes (89): DECISION_LABEL, QuestionVersionPage(), VersionAdmin(), VersionDetails(), AdminQuestionsPage(), QuestionBank(), STATUS_FILTERS, TYPE_LABEL (+81 more)

### Community 1 - "Loading"
Cohesion: 0.08
Nodes (67): Rules this app keeps, AccountPage(), AdminImportsPage(), Imports(), AdminIndexPage(), NewQuestionPage(), Outcome(), ReassessmentResultPage() (+59 more)

### Community 2 - "ErrorNotice"
Cohesion: 0.05
Nodes (79): Blueprints, AdminBlueprintPage(), BlueprintAdmin(), DraftForm(), ReadOnlyBlueprint(), AdminExamPage(), ExamAdmin(), ExamAdminProps (+71 more)

### Community 3 - "Database"
Cohesion: 0.07
Nodes (45): AuditAction, AuditEntry, DATABASE, DATABASE_HANDLE, DatabasePingTimeoutError, pingWithTimeout(), DbExecutor, PgErrorCode (+37 more)

### Community 4 - "questions.service.ts"
Cohesion: 0.05
Nodes (41): AnswerReview, plainText(), QuestionAuthorService, generateStableCode(), answerKeyProblems(), ContentProblem, ContentRule, mappingProblems() (+33 more)

### Community 5 - "assessment.errors.ts"
Cohesion: 0.06
Nodes (33): writeAudit(), BlueprintDetail, BlueprintsService, BlueprintCodeTaken, BlueprintDomainUnknown, BlueprintExamNotFound, BlueprintNeedsPublishedTaxonomy, BlueprintNotEditable (+25 more)

### Community 6 - "api.ts"
Cohesion: 0.06
Nodes (62): AssessmentPage(), NodeRow(), dateFormat, SESSION_STATUS_LABELS, SESSION_TYPE_LABELS, AssessmentQuestions(), EndSession(), Feedback() (+54 more)

### Community 7 - "auth.module.ts"
Cohesion: 0.05
Nodes (16): CurrentUser, systemClock, ActiveSession, AUTH_STORE, AuthStore, CLOCK, NewSession, NewUser (+8 more)

### Community 8 - "app.module.ts"
Cohesion: 0.06
Nodes (24): AppModule, APP_CONFIG, AppConfig, ConfigModule, DatabaseModule, buildLoggerParams(), LoggingModule, pathOnly() (+16 more)

### Community 9 - "CatalogLookup"
Cohesion: 0.04
Nodes (5): AdaptiveSelector, AssessmentStore, CatalogLookup, ReassessmentRecorder, QuestionReader

### Community 10 - "@nestjs/common"
Cohesion: 0.10
Nodes (33): idempotencyKeyHeader, ANALYTICS_WINDOWS, AnalyticsWindowQuery, decimal(), ZodValidationPipe, runsQuery, uuid, createBlueprintBody (+25 more)

### Community 11 - "api/package.json"
Cohesion: 0.05
Nodes (50): dependencies, drizzle-orm@0.45.4, fastify@5.12.5, @fastify/cookie@11.1.2, @nestjs/common@12.0.4, @nestjs/platform-fastify@12.0.4, @nestjs/swagger@12.0.1, @node-rs/argon2@2.2.1 (+42 more)

### Community 12 - "admin-taxonomy.controller.ts"
Cohesion: 0.08
Nodes (21): displayOrder, nodeCode, optionalText(), uuidParam, AdminExamsController, AddPrerequisiteBody, CreateDomainBody, CreateExamBody (+13 more)

### Community 13 - "assessments.service.ts"
Cohesion: 0.06
Nodes (38): ADAPTIVE_SELECTOR, PreliminaryResultReport, SubmitInput, DASHBOARD_DEFAULTS, FULL_DIAGNOSTIC_DEFAULTS, MINI_DIAGNOSTIC_DEFAULTS, PRELIMINARY_RESULT_DEFAULTS, SCORING_VERSION (+30 more)

### Community 14 - "settings/page.tsx"
Cohesion: 0.09
Nodes (43): AdminSettingsPage(), LevelBoundaries(), ReDiagnosticGate(), Settings(), Comparison(), FullReassessmentResultPage(), PREVIOUS_TITLES, State() (+35 more)

### Community 15 - "auth.service.ts"
Cohesion: 0.07
Nodes (21): AuthService, ClientContext, IssuedSession, LoginCommand, RegisterCommand, generateSessionToken(), hashSessionToken(), AccountDisabled (+13 more)

### Community 16 - "حالة التنفيذ — 2026-10-21"
Cohesion: 0.04
Nodes (41): STEM_PREVIEW_LENGTH, stemPreview(), 1.1 Authoring context — `questions.create`, 1.2 Stable rule codes on content problems, 1.3 Stem preview in the list, 1. API additions (no migration), 2.2 Screens, 2.3 Editor (+33 more)

### Community 17 - "lib/permissions.ts"
Cohesion: 0.10
Nodes (34): AdminLayout(), kufi, metadata, RootLayout(), sansArabic, viewport, Providers(), AdminShell() (+26 more)

### Community 18 - "adaptive-engine/src/index.ts"
Cohesion: 0.12
Nodes (37): standingNode(), Rules (engine, pure — `@qup/adaptive-engine`), P1 — Assessment Content, applyEvidence(), ApplyEvidenceInput, ApplyEvidenceResult, baseNegative(), basePositive() (+29 more)

### Community 19 - "AdminGate"
Cohesion: 0.09
Nodes (39): Admin panel, AdminDecisionsPage(), DecisionList(), Decisions(), AdminAnalyticsPage(), Analytics(), ContentCard(), ImportsCard() (+31 more)

### Community 20 - "billing.controller.ts"
Cohesion: 0.10
Nodes (20): AccessStatus, AdminBillingController, uuid, CreatePlanBody, currency, durationDays, GrantEntitlementBody, ListPlansQuery (+12 more)

### Community 21 - "DrizzleAssessmentStore"
Cohesion: 0.06
Nodes (17): CurrentItem, SubmitResult, AssessmentIncomplete, AssessmentNotFound, IdempotencyKeyReused, ItemAlreadyAnswered, PlannedSessionItem, RecordAttemptCommand (+9 more)

### Community 22 - "RequirePermissions"
Cohesion: 0.14
Nodes (17): actorFrom(), AdminQuestionsController, contentBlock, CreateQuestionBody, DraftContentBody, ListQuestionsQuery, mapping, option (+9 more)

### Community 23 - "adaptive-selector.service.ts"
Cohesion: 0.09
Nodes (26): ADAPTIVE_RANDOM, TrainingContext, AdaptiveSelectorService, nodeOf(), toSelectionCandidate(), DrizzleDecisionStore, Task 1: Engine selection rules, ADAPTIVE_ENGINE_VERSION (+18 more)

### Community 24 - "[batchId]/page.tsx"
Cohesion: 0.10
Nodes (37): AdminImportPage(), Import(), MappingSection(), OPTION_LETTERS, Report(), Row(), Rows(), STATUS_FILTERS (+29 more)

### Community 25 - "full-reassessment.service.ts"
Cohesion: 0.09
Nodes (23): FULL_MEASUREMENTS, FullReassessmentResult, FullReassessmentService, FullReassessmentView, isOpen(), latestCompleted(), measureItems(), outcomeOf() (+15 more)

### Community 26 - "skill-profile.service.ts"
Cohesion: 0.10
Nodes (22): ExamProgressCard, NEEDS_EVIDENCE, rankedGaps(), nextStep, NextStepInput, EXAM_ACCESS, ExamAccess, ProfileNode (+14 more)

### Community 27 - "db.ts"
Cohesion: 0.16
Nodes (21): buildPlan(), IdRow, IdRow, expectRejected(), firstRow(), RollbackSignal, SqlState, testSql (+13 more)

### Community 28 - "AGENTS.md — QUP Engineering Agent Contract"
Cohesion: 0.05
Nodes (34): 10. Clean Code, 11. Testing, 12. Security Review, 13. تنفيذ المهمة, 14. متى تقول "تم", 1. دورك, 2. قبل كتابة أي كود, 3. مبادئ إلزامية (+26 more)

### Community 29 - "drizzle-catalog-store.ts"
Cohesion: 0.12
Nodes (27): masteryThreshold, weight, ALLOWED, canTransitionExam(), ExamStatus, CATALOG_STORE, DomainChanges, DomainNode (+19 more)

### Community 30 - "drizzle-question-store.ts"
Cohesion: 0.12
Nodes (17): pgErrorInfo, violatedUniqueConstraint(), QuestionVersionDetail, VersionSummary, QuestionVersionStatus, QuestionContentInvalid, QuestionVersionChanged, StableCodeTaken (+9 more)

### Community 31 - "Principal"
Cohesion: 0.20
Nodes (5): AssessmentsController, toSessionView(), toSubmitView(), Principal, CurrentPrincipal

### Community 32 - "web/package.json"
Cohesion: 0.07
Nodes (35): dependencies, @hookform/resolvers@5.9.1, next@16.4.0, react@19.3.0, react-dom@19.3.0, react-hook-form@7.89.0, @tanstack/react-query@5.104.1, zod@^4.6.5 (+27 more)

### Community 33 - "app-config.ts"
Cohesion: 0.10
Nodes (24): @nestjs/core@12.0.4, reflect-metadata@0.2.2, createApp(), localEnvFile, main(), promptHidden(), readPassword(), booleanFlag (+16 more)

### Community 34 - "DomainError"
Cohesion: 0.10
Nodes (17): DomainError, DomainErrorKind, ExamHasNoPublishedTaxonomy, ExamIdentifierTaken, InvalidExamTransition, PrerequisiteCycle, PrerequisiteOutsideVersion, TaxonomyCodeTaken (+9 more)

### Community 35 - "payments.service.ts"
Cohesion: 0.10
Nodes (14): isUsable(), PaymentsService, sameRequest(), WebhookOutcome, AlreadyEntitled, CheckoutSuperseded, EntitlementNotFound, PaymentIdempotencyKeyReused (+6 more)

### Community 36 - "payment-webhooks.controller.ts"
Cohesion: 0.09
Nodes (12): @nestjs/throttler@6.7.0, DATABASE_HEALTH, AI_THROTTLER, AUTH_THROTTLER, CredentialEndpoint(), GLOBAL_THROTTLER, RateLimitModule, HealthController (+4 more)

### Community 37 - "ref_vitest"
Cohesion: 0.12
Nodes (13): DatabaseHealth, afterBudget(), login(), databaseHealth, student(), STUDENTS, register(), E2E_DATABASE_URL (+5 more)

### Community 38 - "verify"
Cohesion: 0.06
Nodes (33): concurrency, cancel-in-progress, group, DATABASE_URL, POSTGRES_DB, POSTGRES_PASSWORD, POSTGRES_USER, TEST_DATABASE_URL (+25 more)

### Community 39 - "AssessmentsService"
Cohesion: 0.14
Nodes (8): AssessmentsService, toPresentable(), AssessmentNotActive, AssessmentNotCompleted, ReassessmentInProgress, Session, toStudentQuestionView(), DeliverableQuestion

### Community 40 - "billing/domain/ports.ts"
Cohesion: 0.10
Nodes (22): WebhookPayloadInvalid, WebhookSignatureInvalid, toDecimalString(), CheckoutRequest, CheckoutSession, EntitlementSource, PAYMENT_PROVIDER, PaymentStatus (+14 more)

### Community 41 - "ActorContext"
Cohesion: 0.09
Nodes (13): ActorContext, RoleCode, findRoleId(), Entitlement, RefundResult, SettleResult, databaseTime(), entitlementsOf() (+5 more)

### Community 42 - "plans.service.ts"
Cohesion: 0.12
Nodes (13): NewPlan, PlanChanges, PlansService, ExamNotFound, InvalidPlanTransition, PlanNotDraft, PlanNotFound, PlanNotSellable (+5 more)

### Community 43 - "SkillProfileService"
Cohesion: 0.08
Nodes (10): SkillProfileService, DrizzleMasteryReader, SkillStanding, SkillProfileController, B3 Adaptive Training Implementation Plan, Global Constraints, Review Focus, Task 2: Contracts for selection and review (+2 more)

### Community 44 - "e2eSql"
Cohesion: 0.12
Nodes (26): createTaxonomy(), call(), Card, cardFor(), completedFullDiagnostic(), finishMini(), grantAccess(), state() (+18 more)

### Community 45 - "assessment.ts"
Cohesion: 0.09
Nodes (27): adaptiveDecisions, adaptiveDecisionsRelations, adaptiveSessions, adaptiveSessionsRelations, assessmentBlueprints, assessmentBlueprintsRelations, assessmentItems, assessmentItemsRelations (+19 more)

### Community 46 - "QUP — Product Requirements Document v1.0"
Cohesion: 0.07
Nodes (29): 10. Question Requirements, 11. Question Lifecycle, 12. Assessment Types, 13. Mastery State, 14. Content Import, 15. Functional Requirements, 16. NFRs, 17. Metrics to Instrument (+21 more)

### Community 47 - "api-proxy.ts"
Cohesion: 0.12
Nodes (24): CLIENT_IP_HEADER, fastify, FastifyRequest, PROXY_SECRET_HEADER, resolveClientAddress(), sameSecret(), single(), apiBaseUrl() (+16 more)

### Community 48 - "diagnostic-sessions.service.ts"
Cohesion: 0.08
Nodes (18): Diagnostic, DiagnosticKind, DIAGNOSTICS, DiagnosticSessions, ExamNotAvailable, FullDiagnosticAlreadyCompleted, FullDiagnosticRequiresAccess, MiniDiagnosticAlreadyCompleted (+10 more)

### Community 49 - "auth.controller.ts"
Cohesion: 0.14
Nodes (9): AuthController, clientContext(), PublicUser, toPublicUser(), RegisterBody, clearSessionCookie(), readSessionToken(), sessionCookieName() (+1 more)

### Community 50 - "DrizzleCatalogStore"
Cohesion: 0.13
Nodes (8): CreatedNode, TaxonomyVersion, DrizzleCatalogStore, fromDecimal(), fromNullableDecimal(), guarded(), toThreshold(), toWeight()

### Community 51 - "scripts"
Cohesion: 0.08
Nodes (28): devDependencies, @biomejs/biome@2.5.14, turbo@^2.11.2, typescript@^5.9.3, engines, node, typescript, name (+20 more)

### Community 52 - "ai-assistant.service.ts"
Cohesion: 0.14
Nodes (13): AI_PROVIDER, AiAssistantService, contentOf(), failure(), MetadataSuggestionView, TASKS, AiNoSkills, AiOutputInvalid (+5 more)

### Community 53 - "assessments-domain.test.ts"
Cohesion: 0.10
Nodes (19): apportion(), ApportionEntry, distinctQuestions(), interleave(), pickClosest(), PlanCandidate, planDiagnostic(), PlanDomain (+11 more)

### Community 55 - "AdminTaxonomyController"
Cohesion: 0.16
Nodes (5): TaxonomyTree, AdminTaxonomyController, UpdateDomainBody, UpdateSubskillBody, Task 2: API — edit domains and subskills

### Community 56 - "DrizzleCatalogLookup"
Cohesion: 0.07
Nodes (14): ProfileTaxonomy, PublishedTaxonomy, SkillLabel, TaxonomyVersionStatus, DrizzleCatalogLookup, toThreshold(), API, Architecture (+6 more)

### Community 57 - "tabular.ts"
Cohesion: 0.12
Nodes (19): ImportAlreadyImported, ImportFileInvalid, ImportFileProblem, ImportFileTooLarge, ImportFileTypeUnsupported, ImportNotFound, ImportNotProcessed, ImportTaxonomyVersionNotFound (+11 more)

### Community 58 - "ai/page.tsx"
Cohesion: 0.16
Nodes (22): AdminAiPage(), AiRuns(), STATUS_ORDER, AiAssistPanel(), AiAssistPanelProps, AiError(), AiRun, AiRunStatus (+14 more)

### Community 59 - "ai-gateway/src/index.ts"
Cohesion: 0.16
Nodes (20): DATA_ONLY_RULES, escapeXml(), ParsedOutput, parseJsonOutput(), questionBlock(), QuestionContent, XML_ESCAPES, AiTask (+12 more)

### Community 60 - "imports.service.ts"
Cohesion: 0.11
Nodes (16): assertMappingFits(), OPTIONAL_FIELDS, REQUIRED_FIELDS, ResolveAction, textContent(), toDraftContent(), ContentImportModule, ImportMappingInvalid (+8 more)

### Community 61 - "row-normaliser.ts"
Cohesion: 0.13
Nodes (21): optionPosition(), SingleField, SuggestedMapping, suggestMapping(), SYNONYMS, stemFingerprint(), ARABIC_LETTERS, correctPositions() (+13 more)

### Community 62 - "e2e-database.ts"
Cohesion: 0.11
Nodes (16): BlueprintBody, call(), create(), Method, one(), register(), seedExam(), signIn() (+8 more)

### Community 63 - "db/package.json"
Cohesion: 0.10
Nodes (26): dependencies, drizzle-orm@^0.45.4, postgres@^3.4.7, devDependencies, dotenv@^17.2.3, drizzle-kit@^0.31.11, tsx@^4.20.7, @types/node@^24.10.1 (+18 more)

### Community 64 - "full-reassessment.e2e.test.ts"
Cohesion: 0.09
Nodes (11): SYSTEM_ACTOR, AdminBootstrapCommand, AdminBootstrapOutcome, AdminBootstrapService, call(), finish(), register(), startReDiagnostic() (+3 more)

### Community 65 - "QUP Adaptive & Mastery Engine V1"
Cohesion: 0.08
Nodes (25): 10. Timeout / Skip, 11. Response Time, 13. Reassessment, 14. Parent Mastery, 15. Gap Detection, 16. Gap Priority, 17. Target Difficulty, 18. Candidate Filter (+17 more)

### Community 66 - "http.test.ts"
Cohesion: 0.09
Nodes (7): Public(), PaymentWebhooksController, singleHeaders(), ProbeConflict, ProbeController, TEST_ALLOWED_ORIGIN, TEST_BODY_LIMIT_BYTES

### Community 67 - "xlsx-reader.ts"
Cohesion: 0.13
Nodes (19): fflate@0.8.3, IMPORT_LIMITS, IMPORT_UPLOAD_BODY_LIMIT_BYTES, ImportLimits, MAX_UPLOAD_BASE64_CHARS, PARSER_VERSION, attribute(), cellText() (+11 more)

### Community 68 - "mastery-writer.ts"
Cohesion: 0.11
Nodes (20): DbTransaction, NodeSettings, AppliedEvidence, AttemptEvidenceInput, EvidenceTarget, MasteryWriter, nodeKey(), SCALE (+12 more)

### Community 69 - "Design System: QUP"
Cohesion: 0.08
Nodes (24): Assessment / Results, Buttons, Cards / Containers, Chips, Colors, Components, Design System: QUP, Do: (+16 more)

### Community 70 - "admin-forms.ts"
Cohesion: 0.10
Nodes (21): displayOrderField, ExamCreateForm, ExamCreateFormInput, examCreateSchema, ExamEditForm, ExamEditFormInput, examEditSchema, minCoverageField (+13 more)

### Community 71 - "e2eEmail"
Cohesion: 0.12
Nodes (14): answerAll(), call(), register(), register(), exam(), ids, one(), register() (+6 more)

### Community 72 - "environment"
Cohesion: 0.09
Nodes (23): build, condition, env_file, environment, ports, restart, context, dockerfile (+15 more)

### Community 73 - "Implementation Plan + Definition of Done"
Cohesion: 0.08
Nodes (23): Code, Data, Definition of Done, Documentation, First Vertical Slice, Implementation Plan + Definition of Done, Observability, Phase 0 — Foundation (+15 more)

### Community 74 - "QuestionsService"
Cohesion: 0.15
Nodes (7): assertPublishable(), QuestionsService, InvalidQuestionTransition, QuestionArchived, QuestionNotFound, QuestionVersionNotFound, TaxonomyNotPublished

### Community 75 - "node-form.tsx"
Cohesion: 0.15
Nodes (22): asText(), CodeField(), DomainFormView(), PanelActions(), PanelProps, percentText(), SkillFormView(), SubskillFormView() (+14 more)

### Community 76 - "questions.ts"
Cohesion: 0.10
Nodes (21): importBatches, importBatchesRelations, importItems, importItemsRelations, contentReviews, contentReviewsRelations, questionOptions, questionOptionsRelations (+13 more)

### Community 77 - "run.ts"
Cohesion: 0.13
Nodes (17): V1 (C3, 2026-10-21), `packages/ai-gateway` (framework-free), @qup/ai-gateway, Tests, FakeAiProvider, AiProvider, AI_RUN_STATUSES, AiRunOptions (+9 more)

### Community 78 - "StudentDashboardService"
Cohesion: 0.10
Nodes (16): StudentDashboardService, MeController, B5 Student Dashboard Implementation Plan, Global Constraints, Review Focus, Task 1: Next-step rule, Task 2: Dashboard API, Task 3: Dashboard screen (+8 more)

### Community 80 - "AdminImportsController"
Cohesion: 0.21
Nodes (3): AdminImportsController, toBatchView(), toItemView()

### Community 81 - "admin-api.ts"
Cohesion: 0.13
Nodes (18): AddPrerequisiteInput, CreateDomainInput, CreateExamInput, CreateSkillInput, CreateSubskillInput, CreateVersionInput, DomainChanges, DomainNode (+10 more)

### Community 82 - "Coding Standards"
Cohesion: 0.10
Nodes (20): Clean Code, Coding Standards, Comments, Configuration, Date/Time, DIP, DTO vs Domain vs DB, Errors (+12 more)

### Community 83 - "1. Ubiquitous Language"
Cohesion: 0.10
Nodes (21): 1. Ubiquitous Language, Adaptive Decision, Assessment Blueprint, Assessment Item, Assessment Session, Attempt, Confidence Score, Coverage (+13 more)

### Community 84 - "QUP Logical ERD"
Cohesion: 0.10
Nodes (21): Adaptive, adaptive_decisions, adaptive_sessions, audit_logs, Billing, entitlements, import_batches, import_items (+13 more)

### Community 85 - "ai-gateway/package.json"
Cohesion: 0.11
Nodes (20): dependencies, zod@^4.6.5, devDependencies, @types/node@^24.10.1, typescript@^5.9.3, vitest@^5.0.1, exports, files (+12 more)

### Community 86 - "setting-definitions.ts"
Cohesion: 0.18
Nodes (13): ValidationIssue, DEFAULT_FULL_REASSESSMENT_GATE, DEFAULT_PRELIMINARY_LEVELS, FULL_REASSESSMENT_GATE_KEY, gateSchema, levelsSchema, parseSettingValue(), PRELIMINARY_LEVEL_ORDER (+5 more)

### Community 87 - "AdminBlueprintsController"
Cohesion: 0.22
Nodes (3): AdminBlueprintsController, toSummary(), toView()

### Community 88 - "DrizzleBillingStore"
Cohesion: 0.12
Nodes (5): CheckoutResult, PlanCodeTaken, NewPaymentResult, Payment, DrizzleBillingStore

### Community 89 - "stream-provider.test.ts"
Cohesion: 0.15
Nodes (11): isValidStreamSignature(), parseHeader(), signStreamPayload(), FAKE_STREAM_API_KEY, FAKE_STREAM_WEBHOOK_SECRET, FakePayment, FakeStream, readJson() (+3 more)

### Community 90 - "DrizzleImportStore"
Cohesion: 0.14
Nodes (6): ImportItem, ImportItemStatus, ItemUpdate, DrizzleImportStore, toBatch(), toItem()

### Community 91 - "adaptive-engine/package.json"
Cohesion: 0.12
Nodes (19): devDependencies, fast-check@^4.10.2, @types/node@^24.10.1, typescript@^5.9.3, vitest@^5.0.1, exports, files, fast-check (+11 more)

### Community 92 - "_shared.ts"
Cohesion: 0.15
Nodes (16): aiRuns, entitlements, entitlementsRelations, payments, paymentsRelations, plans, plansRelations, aiRunStatusEnum (+8 more)

### Community 93 - "assessments.controller.ts"
Cohesion: 0.14
Nodes (11): requireIdempotencyKey(), ValidationFailed, MAX_RECORDED_RESPONSE_TIME_MS, uuid, AnswerBody, clientTiming, optionKey, SessionHistoryQuery (+3 more)

### Community 94 - "ai/domain/ports.ts"
Cohesion: 0.13
Nodes (7): AI_RUN_STORE, AiRunEntry, AiRunStore, StoredAiRun, DrizzleAiRunStore, AiRunRecord, AiRunStatus

### Community 95 - "ImportsService"
Cohesion: 0.20
Nodes (7): ImportsService, sourceOf(), totalsOf(), ImportItemNotFound, ImportItemNotResolvable, ImportBatch, ImportMapping

### Community 96 - "QUP API Contracts — V1 Outline"
Cohesion: 0.11
Nodes (18): Adaptive, Admin Analytics/Audit, AI Assistance, Auth, Billing, Conventions, Exams, Imports (+10 more)

### Community 97 - "create-app.ts"
Cohesion: 0.15
Nodes (16): @fastify/helmet@13.1.1, nestjs-pino@5.2.0, Tests, AppModuleOptions, registerClientAddress(), API_PREFIX, configureApp(), createAdapter() (+8 more)

### Community 98 - "error-mapping.ts"
Cohesion: 0.16
Nodes (13): ErrorResponse, HTTP_STATUS_BY_KIND, httpStatusOf(), INTERNAL_ERROR, isServerError(), MALFORMED_REQUEST, PLATFORM_ERRORS, PlatformError (+5 more)

### Community 100 - "assessments.module.ts"
Cohesion: 0.21
Nodes (7): AdaptiveModule, AssessmentsModule, BillingModule, CatalogModule, MasteryModule, QuestionsModule, Task 3: Mastery read model and route

### Community 101 - "compilerOptions"
Cohesion: 0.11
Nodes (17): compilerOptions, exactOptionalPropertyTypes, forceConsistentCasingInFileNames, isolatedModules, lib, module, moduleResolution, noEmit (+9 more)

### Community 102 - "billing-domain.test.ts"
Cohesion: 0.18
Nodes (14): accessSummary(), EntitlementPeriod, EntitlementWindow, isInForce(), nextEntitlementPeriod(), isSupportedCurrency(), minimumSellablePriceMinor(), MINOR_UNIT_DIGITS (+6 more)

### Community 105 - "billing.e2e.test.ts"
Cohesion: 0.18
Nodes (13): access(), call(), checkout(), deliver(), exam(), Method, openCheckout(), pay() (+5 more)

### Community 106 - "createdAt"
Cohesion: 0.12
Nodes (16): 1.1 `GET /admin/exams/:id/taxonomy-versions`, 1.2 `PATCH /admin/domains/:id` and `PATCH /admin/subskills/:id`, 1.3 `DELETE /admin/skills/:id/prerequisites/:prerequisiteSkillId`, 1. API additions, 2.1 Access, 2.3 Screens, 2.4 Forms and messages, 2.5 Accessibility and design (+8 more)

### Community 107 - "verify.ts"
Cohesion: 0.18
Nodes (13): describeTarget(), env, envSchema, parsed, main(), migrationsFolder, EXPECTED_GUARD_TRIGGERS, Journal (+5 more)

### Community 108 - "tasks"
Cohesion: 0.12
Nodes (16): dependsOn, outputs, cache, dependsOn, persistent, globalEnv, $schema, tasks (+8 more)

### Community 109 - "AI Integration"
Cohesion: 0.12
Nodes (14): AI Gateway, AI Integration, AI may assist, AI must not be authority for, Error Classification, Evaluation, Principle, Privacy (+6 more)

### Community 110 - "TaxonomyService"
Cohesion: 0.28
Nodes (3): requireDraft(), TaxonomyService, API layering

### Community 111 - "imports.e2e.test.ts"
Cohesion: 0.14
Nodes (10): Batch, call(), CSV, Item, items(), MAPPING, STORAGE, upload() (+2 more)

### Community 112 - "SKILLS.md — Engineering Skills for QUP Agents"
Cohesion: 0.12
Nodes (15): Skill 01 — Requirements & Product Reasoning, Skill 02 — Domain Modeling, Skill 03 — Modular Architecture, Skill 04 — Data Modeling & Migrations, Skill 05 — Adaptive Learning Engineering, Skill 06 — Secure API Design, Skill 07 — File Import Safety, Skill 08 — SOLID & Clean Code (+7 more)

### Community 113 - "Testing Strategy"
Cohesion: 0.12
Nodes (15): API, Bug Rule, CI Gates, Concurrency, E2E, Hardening verification (C4, 2026-10-21), Import Fixtures, Integration (+7 more)

### Community 114 - "auth.dto.ts"
Cohesion: 0.23
Nodes (11): E164_PHONE, normalizeEmail(), parseSignInIdentifier(), SignInIdentifier, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, passwordLength(), email (+3 more)

### Community 115 - "compilerOptions"
Cohesion: 0.13
Nodes (14): compilerOptions, allowJs, incremental, jsx, lib, module, moduleResolution, paths (+6 more)

### Community 116 - "requiredCorrect"
Cohesion: 0.18
Nodes (12): B4 Skill Reassessment Implementation Plan, Global Constraints, Review Focus, Task 1: Engine reassessment rules, Task 2: Reassessment API, Task 3: Reassessment screens, Task 4: Docs, gates, browser, holdRemaining() (+4 more)

### Community 117 - "fake-provider.ts"
Cohesion: 0.22
Nodes (11): draftExplanation(), FAKE_MODEL, FakeFailure, suggestMetadata(), tokens(), waitForAbort(), AiCompletion, AiCompletionRequest (+3 more)

### Community 118 - "identity.ts"
Cohesion: 0.14
Nodes (14): authSessions, authSessionsRelations, permissions, permissionsRelations, rolePermissions, rolePermissionsRelations, roles, rolesRelations (+6 more)

### Community 119 - "PaymentProvider"
Cohesion: 0.14
Nodes (7): PaymentProvider, Open Questions, P0 — Before Production/Commercial Flow, P1 — Admin/Permissions, P2 — AI, P2 — Analytics, P2 — Operations

### Community 120 - "Exam"
Cohesion: 0.21
Nodes (3): ExamsService, ExamNotFound, Exam

### Community 121 - "DrizzleReassessmentStore"
Cohesion: 0.22
Nodes (3): ReassessmentRecorderService, DrizzleReassessmentStore, ReassessmentOutcome

### Community 124 - "taxonomy-tree.tsx"
Cohesion: 0.32
Nodes (13): DomainItem(), KIND_LABEL, NodeShell(), Panel, PanelToggle(), SkillItem(), SubskillItem(), TaxonomyTreeView() (+5 more)

### Community 125 - "QUP Domain Model"
Cohesion: 0.14
Nodes (14): 3. Core Invariants, 4. State Machines, 5. Taxonomy Rules, 6. Question Mapping, 7. Derived Data, Assessment, Assessment Session, Billing (+6 more)

### Community 126 - "Question Bank & Import System"
Cohesion: 0.14
Nodes (13): Canonical Normalized Shape, Duplicate Detection, Goals, Import Report, Initial Supported Formats, PDF/DOCX/Image Pipeline, Prompt Injection, Provenance (+5 more)

### Community 129 - "training.e2e.test.ts"
Cohesion: 0.22
Nodes (10): answer(), call(), current(), CurrentItem, gapOn(), grantAccess(), register(), started() (+2 more)

### Community 130 - "QUP Architecture"
Cohesion: 0.15
Nodes (13): 10. Transactional Outbox, 11. Caching, 12. Scaling, 13. Deployment Rule, 1. Architecture Style, 2. High-Level Architecture, 3. Monorepo Structure, 5. Suggested API Module Layout (+5 more)

### Community 131 - "QUP Production Runbook"
Cohesion: 0.15
Nodes (13): 10. Performance check, 1. What to watch, 2. Deploy and roll back, 3. Migrations, 4. Client address and rate limits (C4), 4a. Rotating the proxy secret, 4b. Other secrets, 5. Outbox worker (+5 more)

### Community 132 - "Security Requirements"
Cohesion: 0.15
Nodes (13): AI Security, Assessment Integrity, Authentication, Authorization, Database, Dependency audit — 2026-10-21 (C4), Feature Security Checklist, File Uploads (+5 more)

### Community 133 - "QUP Workflows"
Cohesion: 0.15
Nodes (12): 10. Payment Workflow, 11. AI-Assisted Content, 1. Student Journey, 2. Mini Diagnostic, 3. Answer Submission, 4. Adaptive Loop, 5. Reassessment, 6. Full Re-Diagnostic (+4 more)

### Community 134 - "@qup/db"
Cohesion: 0.17
Nodes (7): @qup/adaptive-engine, Tests, Commands (from the repo root), Database-enforced invariants, @qup/db, Rules, Setup

### Community 135 - "Review Focus"
Cohesion: 0.18
Nodes (11): Session history, B2 Full Diagnostic and Blueprints Implementation Plan, Global Constraints, Review Focus, Task 1: Planner with already-answered questions, Task 2: Blueprint management API, Task 4: Student web, Task 5: Admin web (+3 more)

### Community 136 - "@qup/api"
Cohesion: 0.17
Nodes (11): AI assistance, Assessments and mastery, Authentication & authorization, Billing, Conventions built in, Endpoints, Exam catalog, First administrator (+3 more)

### Community 138 - "What gets built"
Cohesion: 0.17
Nodes (11): 1. Trusted client address, 2. Cross-site write refusal (web proxy), 3. Content Security Policy (web), 4. Dependencies, 5. Operations, 6. QA, C4 — Hardening, Out of scope (+3 more)

### Community 139 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, declaration, declarationMap, noEmit, outDir, rootDir, sourceMap, exclude (+3 more)

### Community 140 - "settings.service.ts"
Cohesion: 0.25
Nodes (8): defaultVersion(), requireKey(), SettingVersion, isSettingKey(), SETTING_DEFINITIONS, SETTING_KEYS, SettingKey, SettingNotFound

### Community 141 - "SettingsService"
Cohesion: 0.29
Nodes (3): SettingsService, SettingValue, SettingsReader

### Community 142 - "full-diagnostic.e2e.test.ts"
Cohesion: 0.24
Nodes (8): activeBlueprint(), call(), finish(), grantAccess(), one(), register(), startFull(), Student

### Community 143 - "prerequisite-panel.tsx"
Cohesion: 0.38
Nodes (9): PrerequisitePanel(), useTreeMutation(), addPrerequisite(), removePrerequisite(), TaxonomyTree, dropNulls(), prerequisiteCandidates(), skillNames() (+1 more)

### Community 144 - "Deployment — CranL + qupedu.com"
Cohesion: 0.18
Nodes (11): 1. Push the code, 2. The two apps, 3. DNS at Porkbun (qupedu.com), 4. After the first deploy, Current state (2026-10-20), Deployment — CranL + qupedu.com, Environment — qup-backend, Environment — qup-web (+3 more)

### Community 145 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, declaration, declarationMap, noEmit, outDir, rootDir, sourceMap, extends (+2 more)

### Community 146 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, declaration, declarationMap, noEmit, outDir, rootDir, sourceMap, extends (+2 more)

### Community 147 - "operations.ts"
Cohesion: 0.18
Nodes (10): auditLogs, auditLogsRelations, learningEvents, learningEventsRelations, outboxEvents, systemSettings, systemSettingsRelations, outboxStatusEnum (+2 more)

### Community 148 - "taxonomy.ts"
Cohesion: 0.18
Nodes (10): examStatusEnum, taxonomyNodeStatusEnum, taxonomyVersionStatusEnum, domains, domainsRelations, examsRelations, skillPrerequisites, skillsRelations (+2 more)

### Community 150 - "questions.e2e.test.ts"
Cohesion: 0.27
Nodes (7): call(), completeContent(), createQuestion(), Method, publishVersion(), registerUser(), text()

### Community 151 - "Review Focus"
Cohesion: 0.20
Nodes (9): C4 Hardening Implementation Plan, Global Constraints, Review Focus, Task 1: Dependencies, Task 2: Trusted client address, Task 3: Cross-site write refusal, Task 4: Content Security Policy, Task 5: Operations (+1 more)

### Community 152 - "B4 — Skill reassessment and MASTERED"
Cohesion: 0.20
Nodes (9): API, Architecture, B4 — Skill reassessment and MASTERED, Out of scope, Records, Rules (`@qup/adaptive-engine` `reassessment.ts`, `REASSESSMENT_CONFIG_V1`, `reassessment-config-v1.0`), Testing, What a student gets (+1 more)

### Community 153 - "Observability"
Cohesion: 0.20
Nodes (10): Adaptive Decision Audit, Alerts (C4, 2026-10-21), Audit Log vs App Log, Goals, Metrics, Observability, Sentry, Structured Logs (+2 more)

### Community 154 - "scripts"
Cohesion: 0.22
Nodes (9): scripts, admin:create, build, dev, perf, start, test, typecheck (+1 more)

### Community 158 - "ai.e2e.test.ts"
Cohesion: 0.28
Nodes (5): call(), createDraft(), register(), testOptions, text()

### Community 159 - "assessments.e2e.test.ts"
Cohesion: 0.36
Nodes (6): answer(), call(), currentItemId(), finish(), register(), startedSession()

### Community 160 - "compilerOptions"
Cohesion: 0.22
Nodes (8): compilerOptions, noEmit, outDir, rootDir, sourceMap, extends, include, ./tsconfig.json

### Community 161 - "C2 — Outbox worker, metrics and audit screens"
Cohesion: 0.22
Nodes (8): 1. Transactional outbox and worker, 2. Admin read APIs (permission `audit.view`, ADMIN), 3. Admin screens, C2 — Outbox worker, metrics and audit screens, Out of scope, Testing, What gets built, Why

### Community 162 - "assist-nodes.ts"
Cohesion: 0.32
Nodes (6): AssistNode, assistNodes(), AssistOutline, DIFFICULTY_VALUES, SUBSKILL_SEPARATOR, SuggestedDifficulty

### Community 163 - "catalog.e2e.test.ts"
Cohesion: 0.36
Nodes (5): call(), draftExamWithSkill(), linkedSkills(), Method, registerUser()

### Community 164 - "QUP product"
Cohesion: 0.25
Nodes (7): Accessibility & Inclusion, Brand Commitments, Capabilities and Constraints, Platform, Product Purpose, QUP product, Users

### Community 165 - "proxy.ts"
Cohesion: 0.46
Nodes (4): buildContentSecurityPolicy(), createNonce(), config, proxy()

### Community 166 - "Review Focus"
Cohesion: 0.25
Nodes (7): C1 — Versioned System Settings Implementation Plan, Global Constraints, Review Focus, Task 1: Permission and column migrations, Task 2: Settings module (API), Task 4: Web settings page, Task 5: Docs, gates, browser, review

### Community 167 - "Review Focus"
Cohesion: 0.25
Nodes (7): A3 Structured Import Implementation Plan, Global Constraints, Review Focus, Task 1: Parsers and normaliser (pure), Task 2: Import API, Task 3: Import screens, Task 4: Docs, gates, browser

### Community 168 - "Review Focus"
Cohesion: 0.25
Nodes (7): C3 AI Gateway Implementation Plan, Global Constraints, Review Focus, Task 1: `packages/ai-gateway`, Task 2: API `ai` module, Task 3: Web, Task 4: Docs, gates, browser

### Community 169 - "C1 — Versioned system settings (design)"
Cohesion: 0.25
Nodes (7): API, C1 — Versioned system settings (design), Decisions, Goal, Migrations, Tests, Web

### Community 170 - "B2 — Full diagnostic and diagnostic blueprints"
Cohesion: 0.25
Nodes (7): API, B2 — Full diagnostic and diagnostic blueprints, Rules, Testing, What a student gets, What an admin gets, Why

### Community 171 - "C3 — AI gateway (test provider) and author assistance"
Cohesion: 0.25
Nodes (7): API module `ai`, C3 — AI gateway (test provider) and author assistance, Out of scope, Testing, Web, What gets built, Why

### Community 172 - "2. Aggregate Boundaries"
Cohesion: 0.25
Nodes (8): 2. Aggregate Boundaries, Adaptive, Assessment, Billing, Exam Catalog, Identity/RBAC, Mastery, Question Bank

### Community 173 - "scripts"
Cohesion: 0.25
Nodes (8): scripts, build, check, generate, migrate, test, typecheck, verify

### Community 174 - "12. Mastery States"
Cohesion: 0.29
Nodes (7): 12. Mastery States, DEVELOPING, GAP, MASTERED, READY_FOR_REASSESSMENT, UNASSESSED, UNCERTAIN

### Community 176 - "nest-cli.json"
Cohesion: 0.29
Nodes (6): collection, compilerOptions, deleteOutDir, tsConfigPath, $schema, sourceRoot

### Community 179 - "api/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, emitDecoratorMetadata, experimentalDecorators, extends, include, ../../tsconfig.base.json

### Community 180 - "4. Stack"
Cohesion: 0.29
Nodes (7): 4. Stack, API, Data, Quality, Storage, Web, Workspace

### Community 181 - "Review Focus"
Cohesion: 0.29
Nodes (6): B1 — Student Skill Profile Implementation Plan, Global Constraints, Review Focus, Task 1: Engine profile rules, Task 2: Catalog contract — profile taxonomy, Task 5: Docs, gates, browser

### Community 182 - "Review Focus"
Cohesion: 0.29
Nodes (6): C2 Outbox, Metrics and Audit Implementation Plan, Global Constraints, Review Focus, Task 2: Admin read APIs, Task 3: Admin screens, Task 4: Docs, gates, browser

### Community 183 - "Assessment"
Cohesion: 0.29
Nodes (7): Assessment, assessment_blueprints, assessment_items, assessment_sessions, blueprint_rules, question_attempts, skill_reassessments (0014)

### Community 184 - "Exam/Taxonomy"
Cohesion: 0.29
Nodes (7): domains, Exam/Taxonomy, exams, skill_prerequisites, skills, subskills, taxonomy_versions

### Community 185 - "settings.module.ts"
Cohesion: 0.33
Nodes (4): SETTINGS_STORE, SETTINGS_READER, SettingsModule, Task 3: Pin the levels version on each session

### Community 186 - "Provenance"
Cohesion: 0.33
Nodes (5): Files and usage, Primary logo prompt, Provenance, QUP logo assets — 2026-10-17, Standalone symbol prompt

### Community 187 - "B1 — Student skill profile (design)"
Cohesion: 0.33
Nodes (5): API, B1 — Student skill profile (design), Goal, Tests, Web

### Community 188 - "Question Bank"
Cohesion: 0.33
Nodes (6): content_reviews, Question Bank, question_options, question_skill_mappings, question_versions, questions

### Community 189 - "Assessments"
Cohesion: 0.40
Nodes (5): Assessments, Full diagnostic, Full re-diagnostic, Preliminary Result, Submit Answer

### Community 191 - "QUP interface improvement — 2026-10-17"
Cohesion: 0.40
Nodes (4): First viewport and visual rules, QUP interface improvement — 2026-10-17, Scope and acceptance, Verification

### Community 192 - "Review Focus"
Cohesion: 0.40
Nodes (5): Review Focus, Task 0: Local toolchain and database baseline, Task 1: API — list an exam's taxonomy versions, Task 3: API — remove a prerequisite, Task 9: Docs, gates, browser verification and security review

### Community 193 - "Identity/RBAC"
Cohesion: 0.50
Nodes (4): auth_sessions, Identity/RBAC, roles / permissions / user_roles / role_permissions, users

### Community 194 - "adaptive-engine/tsconfig.json"
Cohesion: 0.50
Nodes (3): extends, include, ../../tsconfig.base.json

### Community 195 - "ai-gateway/tsconfig.json"
Cohesion: 0.50
Nodes (3): extends, include, ../../tsconfig.base.json

### Community 196 - "db/tsconfig.json"
Cohesion: 0.50
Nodes (3): extends, include, ../../tsconfig.base.json

### Community 197 - "pnpm-workspace.yaml"
Cohesion: 0.50
Nodes (3): overrides, source-map-js, packages

## Knowledge Gaps
- **10 isolated node(s):** `RFC-4180`, `./tsconfig.json`, `../../tsconfig.base.json`, `../../tsconfig.base.json`, `./tsconfig.json` (+5 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1766 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **24 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `@nestjs/common` connect `@nestjs/common` to `Database`, `questions.service.ts`, `assessment.errors.ts`, `auth.module.ts`, `app.module.ts`, `api/package.json`, `admin-taxonomy.controller.ts`, `assessments.service.ts`, `settings.service.ts`, `auth.service.ts`, `billing.controller.ts`, `RequirePermissions`, `adaptive-selector.service.ts`, `full-reassessment.service.ts`, `skill-profile.service.ts`, `drizzle-catalog-store.ts`, `drizzle-question-store.ts`, `DomainError`, `payments.service.ts`, `payment-webhooks.controller.ts`, `ref_vitest`, `plans.service.ts`, `diagnostic-sessions.service.ts`, `auth.controller.ts`, `ai-assistant.service.ts`, `settings.module.ts`, `imports.service.ts`, `e2e-database.ts`, `full-reassessment.e2e.test.ts`, `http.test.ts`, `mastery-writer.ts`, `e2eEmail`, `assessments.controller.ts`, `error-mapping.ts`, `assessments.module.ts`?**
  _High betweenness centrality (0.115) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `api()` (e.g. with `3. DNS at Porkbun (qupedu.com)` and `Task 9: Docs, gates, browser verification and security review`) actually correct?**
  _`api()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `RFC-4180`, `./tsconfig.json`, `../../tsconfig.base.json` to the rest of the system?**
  _10 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `api` be split into smaller, more focused modules?**
  _Cohesion score 0.04496561453006524 - nodes in this community are weakly interconnected._
- **Why does `DomainError` connect `DomainError` to `Database`, `assessment.errors.ts`, `@qup/api`, `QuestionAuthoringController`, `@nestjs/common`, `settings.service.ts`, `assessments.service.ts`, `auth.service.ts`, `DrizzleAssessmentStore`, `full-reassessment.service.ts`, `skill-profile.service.ts`, `drizzle-catalog-store.ts`, `drizzle-question-store.ts`, `payments.service.ts`, `AssessmentsService`, `billing/domain/ports.ts`, `ActorContext`, `plans.service.ts`, `diagnostic-sessions.service.ts`, `ai-assistant.service.ts`, `tabular.ts`, `imports.service.ts`, `http.test.ts`, `QuestionsService`, `setting-definitions.ts`, `DrizzleBillingStore`, `assessments.controller.ts`, `ImportsService`, `error-mapping.ts`, `Exam`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **Should `Loading` be split into smaller, more focused modules?**
  _Cohesion score 0.08308439133681852 - nodes in this community are weakly interconnected._
- **Why does `Database` connect `Database` to `questions.service.ts`, `assessment.errors.ts`, `auth.module.ts`, `app.module.ts`, `@nestjs/common`, `DrizzleAssessmentStore`, `DrizzleQuestionReader`, `adaptive-selector.service.ts`, `OutboxRelay`, `AdminImportAnalyticsController`, `drizzle-catalog-store.ts`, `drizzle-question-store.ts`, `ActorContext`, `SkillProfileService`, `DrizzleCatalogStore`, `DrizzleCatalogLookup`, `e2eEmail`, `DrizzleBillingStore`, `DrizzleImportStore`, `ai/domain/ports.ts`, `DrizzleReassessmentStore`, `QuestionBankStats`, `AnalyticsService`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._