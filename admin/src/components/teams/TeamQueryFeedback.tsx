import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/page";
import { tr } from "../../i18n/translate.ts";

/** 团队列表统一呈现加载、错误重试和空结果。 */
export function TeamQueryFeedback({ loading, error, empty, onRetry }: { loading: boolean; error: string; empty: boolean; onRetry: () => void }) {
  if (loading) return <div role="status" className="p-10 text-center text-sm text-[var(--admin-muted)]">{tr("teamsUi.loading")}</div>;
  if (error) return <div role="alert" className="flex flex-wrap items-center justify-center gap-3 p-8 text-sm text-red-700"><span>{error}</span><Button type="button" size="sm" variant="outline" onClick={onRetry}>{tr("teamsUi.reload")}</Button></div>;
  if (empty) return <EmptyState title={tr("teamsUi.emptyTitle")} description={tr("teamsUi.emptyDesc")} />;
  return null;
}
