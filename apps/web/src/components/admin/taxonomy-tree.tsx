"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import {
  archiveNode,
  type DomainNode,
  type NodeType,
  type SkillNode,
  type SubskillNode,
  type TaxonomyTree,
} from "@/lib/admin-api";
import { shareToPercent } from "@/lib/admin-forms";
import { skillNames } from "@/lib/taxonomy-view";
import { Icon } from "../icon";
import { ErrorNotice } from "../status";
import { ConfirmAction } from "./confirm-action";
import { DomainFormView, SkillFormView, SubskillFormView } from "./node-form";
import { PrerequisitePanel } from "./prerequisite-panel";
import { StatusBadge } from "./status-badge";
import { useTreeMutation } from "./tree-mutation";

interface TreeCallbacks {
  /** Something changed: refetch the tree. */
  onChanged: () => void;
  /** The version stopped being a draft: refetch, and the screen turns read-only. */
  onStale: () => void;
}

interface TreeContext extends TreeCallbacks {
  tree: TaxonomyTree;
  editable: boolean;
}

/**
 * Domains → skills → subskills as nested lists. Editing controls appear only
 * while the version is a DRAFT; every change goes to the API and the tree is
 * then refetched, never patched here.
 */
export function TaxonomyTreeView({ tree, editable, onChanged, onStale }: TreeContext) {
  const [adding, setAdding] = useState(false);
  const addButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  useEffect(() => {
    if (adding || !returnFocus.current) return;
    returnFocus.current = false;
    addButton.current?.focus();
  }, [adding]);
  const stopAdding = () => {
    returnFocus.current = true;
    setAdding(false);
  };
  const context = { tree, editable, onChanged, onStale };

  return (
    <div className="stack">
      {tree.domains.length === 0 ? (
        <p className="muted">لا توجد مجالات بعد.{editable ? " ابدأ بإضافة أول مجال." : ""}</p>
      ) : (
        <ul className="tree">
          {tree.domains.map((domain) => (
            <DomainItem key={domain.id} domain={domain} {...context} />
          ))}
        </ul>
      )}
      {editable && !adding ? (
        <button
          ref={addButton}
          type="button"
          className="btn btn--small"
          onClick={() => setAdding(true)}
        >
          <Icon name="plus" /> إضافة مجال
        </button>
      ) : null}
      {editable && adding ? (
        <DomainFormView
          mode="create"
          versionId={tree.version.id}
          idPrefix="new-domain"
          onDone={() => {
            stopAdding();
            onChanged();
          }}
          onStale={onStale}
          onCancel={stopAdding}
        />
      ) : null}
    </div>
  );
}

type Panel = "edit" | "add-child" | "prerequisites";

/**
 * Which inline panel a node has open. Closing it — cancel or save — puts
 * focus back on the button that opened it, so keyboard users keep their place.
 */
function usePanel<P extends string>() {
  const [panel, setPanel] = useState<P | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const returnFocus = useRef(false);
  useEffect(() => {
    if (panel !== null || !returnFocus.current) return;
    returnFocus.current = false;
    opener.current?.focus();
  }, [panel]);
  const close = () => {
    returnFocus.current = true;
    setPanel(null);
  };
  const toggle = (next: P) => {
    if (panel === next) return close();
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPanel(next);
  };
  return { panel, toggle, close };
}

function DomainItem({ domain, ...context }: TreeContext & { domain: DomainNode }) {
  const { panel, toggle, close } = usePanel<Panel>();
  const done = () => {
    close();
    context.onChanged();
  };
  const canEdit = context.editable && domain.status !== "ARCHIVED";

  return (
    <NodeShell
      type="domain"
      node={domain}
      context={context}
      meta={[`الوزن ${domain.weight}`, `الترتيب ${domain.displayOrder}`]}
      actions={
        canEdit ? (
          <>
            <PanelToggle label="تعديل" active={panel === "edit"} onToggle={() => toggle("edit")} />
            <PanelToggle
              label="إضافة مهارة"
              active={panel === "add-child"}
              onToggle={() => toggle("add-child")}
            />
          </>
        ) : null
      }
      panel={
        !canEdit ? null : panel === "edit" ? (
          <DomainFormView
            mode="edit"
            node={domain}
            idPrefix={`${domain.id}-edit`}
            onDone={done}
            onStale={context.onStale}
            onCancel={close}
          />
        ) : panel === "add-child" ? (
          <SkillFormView
            mode="create"
            domainId={domain.id}
            idPrefix={`${domain.id}-new-skill`}
            onDone={done}
            onStale={context.onStale}
            onCancel={close}
          />
        ) : null
      }
    >
      {domain.skills.length > 0 ? (
        domain.skills.map((skill) => <SkillItem key={skill.id} skill={skill} {...context} />)
      ) : (
        <li className="small muted">لا توجد مهارات في هذا المجال بعد.</li>
      )}
    </NodeShell>
  );
}

function SkillItem({ skill, ...context }: TreeContext & { skill: SkillNode }) {
  const { panel, toggle, close } = usePanel<Panel>();
  const done = () => {
    close();
    context.onChanged();
  };
  const canEdit = context.editable && skill.status !== "ARCHIVED";
  const names = skillNames(context.tree);
  const prerequisites = skill.prerequisites.map(
    (link) => names.get(link.prerequisiteSkillId) ?? "مهارة غير معروفة",
  );

  return (
    <NodeShell
      type="skill"
      node={skill}
      context={context}
      meta={[
        `حد الإتقان ${thresholdText(skill.masteryThreshold)}`,
        `الوزن ${skill.weight}`,
        `الأولوية ${skill.priorityWeight}`,
        `أدنى تغطية ${skill.minCoverage}`,
      ]}
      extra={
        prerequisites.length > 0 ? (
          <p className="tree-node__prerequisites small">يتطلب: {prerequisites.join("، ")}</p>
        ) : null
      }
      actions={
        canEdit ? (
          <>
            <PanelToggle label="تعديل" active={panel === "edit"} onToggle={() => toggle("edit")} />
            <PanelToggle
              label="إضافة مهارة فرعية"
              active={panel === "add-child"}
              onToggle={() => toggle("add-child")}
            />
            <PanelToggle
              label="المتطلبات السابقة"
              active={panel === "prerequisites"}
              onToggle={() => toggle("prerequisites")}
            />
          </>
        ) : null
      }
      panel={
        !canEdit ? null : panel === "edit" ? (
          <SkillFormView
            mode="edit"
            node={skill}
            idPrefix={`${skill.id}-edit`}
            onDone={done}
            onStale={context.onStale}
            onCancel={close}
          />
        ) : panel === "add-child" ? (
          <SubskillFormView
            mode="create"
            skillId={skill.id}
            idPrefix={`${skill.id}-new-subskill`}
            onDone={done}
            onStale={context.onStale}
            onCancel={close}
          />
        ) : panel === "prerequisites" ? (
          // Stays open after each change, so several links can be managed in a row.
          <PrerequisitePanel
            tree={context.tree}
            skill={skill}
            idPrefix={`${skill.id}-prerequisites`}
            onDone={context.onChanged}
            onStale={context.onStale}
            onCancel={close}
          />
        ) : null
      }
    >
      {skill.subskills.length > 0
        ? skill.subskills.map((subskill) => (
            <SubskillItem key={subskill.id} subskill={subskill} {...context} />
          ))
        : undefined}
    </NodeShell>
  );
}

function SubskillItem({ subskill, ...context }: TreeContext & { subskill: SubskillNode }) {
  const { panel, toggle, close } = usePanel<"edit">();
  const editing = panel === "edit";
  const canEdit = context.editable && subskill.status !== "ARCHIVED";

  return (
    <NodeShell
      type="subskill"
      node={subskill}
      context={context}
      meta={[`حد الإتقان ${thresholdText(subskill.masteryThreshold)}`, `الوزن ${subskill.weight}`]}
      actions={
        canEdit ? (
          <PanelToggle label="تعديل" active={editing} onToggle={() => toggle("edit")} />
        ) : null
      }
      panel={
        canEdit && editing ? (
          <SubskillFormView
            mode="edit"
            node={subskill}
            idPrefix={`${subskill.id}-edit`}
            onDone={() => {
              close();
              context.onChanged();
            }}
            onStale={context.onStale}
            onCancel={close}
          />
        ) : null
      }
    />
  );
}

const KIND_LABEL: Record<NodeType, string> = {
  domain: "مجال",
  skill: "مهارة",
  subskill: "مهارة فرعية",
};

/**
 * One node: a disclosure button with its name, its numbers in words, its
 * actions, an inline panel, and its children. Archiving lives here because
 * every kind archives the same way.
 */
function NodeShell({
  type,
  node,
  context,
  meta,
  extra,
  actions,
  panel,
  children,
}: {
  type: NodeType;
  node: DomainNode | SkillNode | SubskillNode;
  context: TreeContext;
  meta: string[];
  extra?: ReactNode;
  actions: ReactNode;
  panel: ReactNode;
  children?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(true);
  const childrenId = useId();
  const archive = useTreeMutation(() => archiveNode(type, node.id), {
    onDone: context.onChanged,
    onStale: context.onStale,
  });
  const hasChildren = children !== undefined && children !== null;
  const canArchive = context.editable && node.status !== "ARCHIVED";

  return (
    <li className={`tree-node tree-node--${type}`}>
      <div className="tree-node__row">
        {hasChildren ? (
          <button
            type="button"
            className="tree-toggle"
            aria-expanded={expanded}
            aria-controls={childrenId}
            onClick={() => setExpanded(!expanded)}
          >
            <Icon name="chevron" className="tree-toggle__icon" />
            <span className="tree-node__name">{node.name}</span>
          </button>
        ) : (
          <span className="tree-node__name tree-node__name--leaf">{node.name}</span>
        )}
        <span className="small muted">{KIND_LABEL[type]}</span>
        <span className="tree-node__code small" dir="ltr">
          {node.code}
        </span>
        <StatusBadge status={node.status} />
      </div>
      <p className="tree-node__meta small muted">{meta.join(" · ")}</p>
      {extra}
      {actions || canArchive ? (
        <div className="tree-node__actions row">
          {actions}
          {canArchive ? (
            <ConfirmAction
              label="أرشفة"
              description={`أرشفة ${KIND_LABEL[type]} «${node.name}» لا تحذفه، لكنه يتوقف عن الاستخدام في هذه النسخة ولا يمكن إعادته.`}
              danger
              pending={archive.isPending}
              onConfirm={() => archive.mutate(undefined)}
            />
          ) : null}
        </div>
      ) : null}
      {archive.isError ? <ErrorNotice error={archive.error} /> : null}
      {panel}
      {hasChildren ? (
        <ul id={childrenId} className="tree tree--nested" hidden={!expanded}>
          {children}
        </ul>
      ) : null}
    </li>
  );
}

function PanelToggle({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`btn btn--small ${active ? "" : "btn--ghost"}`}
      aria-pressed={active}
      onClick={onToggle}
    >
      {label}
    </button>
  );
}

function thresholdText(share: number | null): string {
  return share === null ? "الافتراضي" : `${shareToPercent(share)}٪`;
}
