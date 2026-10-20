import type { ExamStatus, NodeStatus, VersionStatus } from "@/lib/admin-api";
import type { QuestionVersionStatus } from "@/lib/question-api";

type Status = ExamStatus | VersionStatus | NodeStatus | QuestionVersionStatus;

const LABELS: Record<Status, string> = {
  DRAFT: "مسودة",
  ACTIVE: "نشط",
  PUBLISHED: "منشور",
  ARCHIVED: "مؤرشف",
  UNDER_REVIEW: "قيد المراجعة",
  APPROVED: "معتمد",
};

/** The status in words; colour only repeats it. */
export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`status-badge status-badge--${status.toLowerCase()}`}>{LABELS[status]}</span>
  );
}
