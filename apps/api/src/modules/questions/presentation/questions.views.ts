import type {
  QuestionListItem,
  QuestionSummary,
  QuestionVersionDetail,
  VersionSummary,
} from "../domain/ports.js";

/**
 * Admin response shapes. These include the answer key and explanation: they
 * are served only on routes that require questions.* permissions. Students
 * receive questions exclusively through `toStudentQuestionView`.
 */

const iso = (date: Date | null) => date?.toISOString() ?? null;

function toVersionSummaryView(version: VersionSummary) {
  return { ...version, updatedAt: version.updatedAt.toISOString() };
}

export function toQuestionView(question: QuestionSummary) {
  return {
    id: question.id,
    stableCode: question.stableCode,
    archivedAt: iso(question.archivedAt),
    createdAt: question.createdAt.toISOString(),
    versions: question.versions.map(toVersionSummaryView),
  };
}

export function toQuestionListItemView(item: QuestionListItem) {
  return {
    id: item.id,
    stableCode: item.stableCode,
    archivedAt: iso(item.archivedAt),
    latestVersion: toVersionSummaryView(item.latestVersion),
  };
}

export function toVersionDetailView(version: QuestionVersionDetail) {
  return {
    ...version,
    publishedAt: iso(version.publishedAt),
    createdAt: version.createdAt.toISOString(),
    updatedAt: version.updatedAt.toISOString(),
    reviews: version.reviews.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
  };
}
