import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/api/client";
import { getToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { SettingsPanel } from "./SettingsPanel";
import { tr } from "@/i18n";

type CutoverState = {
  paused?: boolean; phase?: string; job_id?: string; backup_sha256?: string; migrated_count?: number;
  history?: { action: string; operator_id: number; reason: string; at: string; job_id?: string; report?: unknown }[];
};
type Report = {
  state: CutoverState; missing_schema: string[]; ready: number; blocked: number;
  already_migrated: number; active_tasks: boolean;
  accounts: { user_id: number; status: string; balance_fen?: number; merged_balance_fen?: number; reason?: string }[];
};
const endpoint = "/api/admin/settings/wallet-migration";
// 账户核对状态名（函数而非常量，避免导入时固化语言）
function statusName(status: string): string {
  return ["ready", "blocked", "already_migrated"].includes(status) ? tr(`walletMigration.status.${status}`) : status;
}

export function WalletMigrationSettings() {
  const [report, setReport] = useState<Report>();
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");
  async function refresh() { setReport(await api<Report>(endpoint)); }
  async function run(action?: "pause" | "apply" | "resume") {
    if (action && reason.trim().length < 3) { toast.error(tr("walletMigration.reasonTooShort")); return; }
    if (action === "pause" && !window.confirm(tr("walletMigration.confirmPause"))) return;
    if (action === "apply" && !window.confirm(tr("walletMigration.confirmApply"))) return;
    if (action === "resume" && !window.confirm(tr("walletMigration.confirmResume"))) return;
    setBusy(true); setError("");
    try {
      if (action) await api(endpoint + "/" + action, { method: "POST", body: JSON.stringify({ reason: reason.trim(), job_id: report?.state.job_id || "" }) });
      await refresh();
      if (action) toast.success(action === "apply" ? tr("walletMigration.applied") : tr("walletMigration.done"));
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("walletMigration.failed"));
      // A timed-out response is not proof that the transaction failed.
      try { await refresh(); } catch { /* retain the last known state */ }
    } finally { setBusy(false); }
  }
  async function download() {
    setBusy(true);
    try {
      const response = await fetch(endpoint + "/backup", { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!response.ok) throw new Error(tr("walletMigration.backupFailed"));
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = url; link.download = `${report?.state.job_id}.dump`;
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(e instanceof Error ? e.message : tr("walletMigration.downloadFailed")); }
    finally { setBusy(false); }
  }
  const paused = !!report?.state.paused;
  const completed = report?.state.phase === "completed";
  const rows = report?.accounts.filter(row => (!filter || String(row.user_id).includes(filter) || row.reason?.includes(filter))) || [];
  return <SettingsPanel title={tr("walletMigration.title")} description={tr("walletMigration.desc")}>
    <div className="space-y-4">
      <Button type="button" disabled={busy} onClick={() => void run()}>{tr("walletMigration.refresh")}</Button>
      <p>{tr("walletMigration.notice")}</p>
      {error && <p role="alert" className="text-red-600">{error}</p>}
      {report && <>
        <p>{tr("walletMigration.summary", { state: tr(paused ? "walletMigration.paused" : "walletMigration.normal"), ready: report.ready, blocked: report.blocked, done: report.already_migrated, active: tr(report.active_tasks ? "walletMigration.activeYes" : "walletMigration.activeNo") })}</p>
        {report.missing_schema.length > 0 && <p role="alert">{tr("walletMigration.schemaMissing", { items: report.missing_schema.join(tr("walletMigration.listSep")) })}</p>}
        <label className="block">{tr("walletMigration.reason")}<input className="block w-full" value={reason} maxLength={500} onChange={e => setReason(e.target.value)} placeholder={tr("walletMigration.reasonPlaceholder")} /></label>
        <div className="flex flex-wrap gap-3">
          <Button type="button" disabled={busy || paused || !!report.missing_schema.length} onClick={() => void run("pause")}>{tr("walletMigration.stepPause")}</Button>
          <Button type="button" disabled={busy || !paused || completed || !!report.blocked || report.active_tasks || !!report.missing_schema.length} onClick={() => void run("apply")}>{tr("walletMigration.stepApply")}</Button>
          <Button type="button" disabled={busy || !paused} onClick={() => void run("resume")}>{completed ? tr("walletMigration.stepResume") : tr("walletMigration.cancel")}</Button>
          {report.state.backup_sha256 && <Button type="button" disabled={busy} onClick={() => void download()}>{tr("walletMigration.download")}</Button>}
        </div>
        {report.state.job_id && <p className="break-all">{tr("walletMigration.jobLine", { job: report.state.job_id, sha: report.state.backup_sha256 || tr("walletMigration.notDone") })}</p>}
        {completed && <p>{tr("walletMigration.completedNote", { n: report.state.migrated_count })}</p>}
        <label className="block">{tr("walletMigration.filter")}<input className="block w-full" value={filter} onChange={e => setFilter(e.target.value)} /></label>
        <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th>{tr("walletMigration.colUser")}</th><th>{tr("walletMigration.colStatus")}</th><th>{tr("walletMigration.colBefore")}</th><th>{tr("walletMigration.colAfter")}</th><th>{tr("walletMigration.colReason")}</th></tr></thead><tbody>{rows.slice(0, 100).map(row => <tr key={row.user_id}><td>{row.user_id}</td><td>{statusName(row.status)}</td><td>{row.balance_fen ?? "—"}</td><td>{row.merged_balance_fen ?? "—"}</td><td>{row.reason || "—"}</td></tr>)}</tbody></table></div>
        <p>{tr("walletMigration.rowsNote", { n: rows.length })}</p>
        <details><summary>{tr("walletMigration.audit")}</summary>{report.state.history?.map((item, i) => <div key={i}><p>{item.at} · {item.action} · {tr("walletMigration.operator", { id: item.operator_id })} · {item.reason} · {item.job_id}</p>{item.report != null && <details><summary>{tr("walletMigration.viewSnapshot")}</summary><pre className="overflow-x-auto">{JSON.stringify(item.report, null, 2)}</pre></details>}</div>)}</details>
      </>}
    </div>
  </SettingsPanel>;
}
