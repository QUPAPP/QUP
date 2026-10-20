import type { ExamStatus, NodeStatus, VersionStatus } from "@/lib/admin-api";

type Status = ExamStatus | VersionStatus | NodeStatus;

const LABELS: Record<Status, string> = {
  DRAFT: "مسودة",
  ACTIVE: "نشط",
  PUBLISHED: "منشور",
  ARCHIVED: "مؤرشف",
};

/** The status in words; colour only repeats it. */
export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`status-badge status-badge--${status.toLowerCase()}`}>{LABELS[status]}</span>
  );
}
