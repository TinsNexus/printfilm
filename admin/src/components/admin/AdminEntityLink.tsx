import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { formatAccountId } from "@/lib/admin-account";
import { tr } from "@/i18n/translate";

type EntityKind = "user" | "project" | "drama" | "drama_asset" | "task" | "order";

type AdminEntityLinkProps = {
  kind: EntityKind;
  id: number;
  label?: string;
  className?: string;
};

function buildHref(kind: EntityKind, id: number): string {
  switch (kind) {
    case "user":
      return `/users?user=${id}`;
    case "project":
      return `/projects?open=${id}`;
    case "drama":
      return `/drama-projects/${id}`;
    case "drama_asset":
      return `/drama-assets/${id}`;
    case "task":
      return `/queues?task=${id}`;
    case "order":
      return `/orders?tab=orders&order=${id}`;
    default:
      return "#";
  }
}

function defaultLabel(kind: EntityKind, id: number): string {
  switch (kind) {
    case "user":
      return tr("ui.idLabel", { id: formatAccountId(id) });
    case "project":
      return tr("ui.explainer", { id });
    case "drama":
      return tr("ui.drama", { id });
    case "drama_asset":
      return tr("ui.asset", { id });
    case "task":
      return tr("ui.task", { id });
    case "order":
      return tr("ui.order", { id });
    default:
      return String(id);
  }
}

/** 跨页实体跳转链接 */
export function AdminEntityLink({ kind, id, label, className }: AdminEntityLinkProps) {
  if (!id) return <span className="text-[var(--admin-muted)]">—</span>;
  return (
    <Link to={buildHref(kind, id)} className={cn("admin-link font-medium", className)}>
      {label ?? defaultLabel(kind, id)}
    </Link>
  );
}
