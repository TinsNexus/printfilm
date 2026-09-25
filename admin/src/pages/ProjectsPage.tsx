import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, type AdminProject, type PageMeta } from "@/api/client";
import {
  AdminDetailMeta,
  AdminDetailNote,
  AdminDetailSection,
  AdminDetailStatGrid,
  AdminDetailTableWrap,
} from "@/components/admin/AdminDetailLayout";
import { AdminEntityLink } from "@/components/admin/AdminEntityLink";
import { AdminFilterBar } from "@/components/admin/AdminFilterBar";
import { AdminModal } from "@/components/admin/AdminModal";
import { AdminUserSearchSelect } from "@/components/admin/AdminUserSearchSelect";
import { PaginationBar } from "@/components/PaginationBar";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/page";
import { useAdminDetailQuery } from "@/hooks/useAdminDetailQuery";
import { projectStatusLabel, projectStatusOptions, taskStatusLabel, taskTypeLabel } from "@/lib/statusLabels";
import { fenToYuan } from "@/lib/utils";
import { formatDateTime, useI18n } from "@/i18n";

type ListRes = { items: AdminProject[]; meta: PageMeta };

function statusBadgeVariant(status: string): "destructive" | "success" | "warning" | "info" | "secondary" {
  if (status === "FAILED" || status === "REJECTED") return "destructive";
  if (status === "DONE") return "success";
  if (status === "CANCELLED") return "secondary";
  if (status === "DRAFT") return "secondary";
  return "info";
}

function mediaSrc(url: string | null | undefined): string {
  const trimmed = (url || "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

// 科普项目列表与详情（镜头 / 任务 / 费用 / 媒体预览）
export function ProjectsPage() {
  const { t: tx } = useI18n();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [userId, setUserId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListRes | null>(null);
  const [detail, setDetail] = useState<AdminProject | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const projectDetail = useAdminDetailQuery("open");

  async function load(nextPage = page) {
    try {
      const params = new URLSearchParams({ page: String(nextPage), page_size: String(DEFAULT_PAGE_SIZE) });
      if (status) params.set("status", status);
      if (q.trim()) params.set("q", q.trim());
      if (userId) params.set("user_id", String(userId));
      setData(await api<ListRes>(`/api/admin/projects?${params}`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tx("projects.failedLoad"));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function openDetail(id: number) {
    setDetailLoading(true);
    projectDetail.open(id);
    try {
      setDetail(await api<AdminProject>(`/api/admin/projects/${id}`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tx("projects.couldLoadDetails"));
      projectDetail.close();
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    if (!projectDetail.id) {
      setDetail(null);
      return;
    }
    if (detail?.id === projectDetail.id) return;
    void openDetail(projectDetail.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectDetail.id]);

  const usage = detail?.usage;

  return (
    <div className="admin-list-page">
      <PageHeader description={tx("projects.explainerPipelineProjectsStatus")} />
      <AdminFilterBar>
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          {projectStatusOptions().map((opt) => (
            <option key={opt.value || "all"} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
        <Input placeholder={tx("projects.titleErrorMessage")} value={q} onChange={(e) => setQ(e.target.value)} />
        <AdminUserSearchSelect value={userId} onChange={(id) => setUserId(id)} />
        <Button
          size="sm"
          variant="secondary"
          className="admin-filter-action"
          onClick={() => {
            setPage(1);
            void load(1);
          }}
        >
          {tx("projects.filter")}
        </Button>
      </AdminFilterBar>
      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>{tx("projects.title")}</TableHead>
              <TableHead>{tx("projects.user")}</TableHead>
              <TableHead>{tx("projects.template")}</TableHead>
              <TableHead>{tx("projects.pipeline")}</TableHead>
              <TableHead>{tx("projects.status")}</TableHead>
              <TableHead>{tx("projects.progress")}</TableHead>
              <TableHead>{tx("projects.shots")}</TableHead>
              <TableHead>{tx("projects.cost")}</TableHead>
              <TableHead>{tx("projects.created")}</TableHead>
              <TableHead>{tx("projects.updated")}</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.items ?? []).map((p) => (
              <TableRow key={p.id}>
                <TableCell>{p.id}</TableCell>
                <TableCell className="max-w-[180px] truncate">{p.title}</TableCell>
                <TableCell className="text-sm">
                  <AdminEntityLink kind="user" id={p.user_id} label={p.user_email ?? undefined} />
                </TableCell>
                <TableCell className="font-mono text-xs">{p.template_id}</TableCell>
                <TableCell className="text-xs">{p.pipeline_mode}</TableCell>
                <TableCell>
                  <Badge variant={statusBadgeVariant(p.status)}>{projectStatusLabel(p.status)}</Badge>
                </TableCell>
                <TableCell>{p.progress}%</TableCell>
                <TableCell>{p.shot_count}</TableCell>
                <TableCell>¥{fenToYuan(p.charge_fen ?? 0)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatDateTime(p.created_at)}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatDateTime(p.updated_at)}
                </TableCell>
                <TableCell>
                  <Button size="sm" variant="outline" onClick={() => void openDetail(p.id)}>
                    {tx("projects.details")}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {data && (
        <PaginationBar
          page={data.meta.page}
          pageSize={data.meta.page_size}
          total={data.meta.total}
          onPageChange={setPage}
        />
      )}

      <AdminModal
        open={projectDetail.isOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDetail(null);
            projectDetail.close();
          }
        }}
        size="full"
        title={detail ? tx("projects.explainerProject", { detailId: detail.id, detailTitle: detail.title }) : tx("projects.explainerProjectDetails")}
        subtitle={detail ? projectStatusLabel(detail.status) : detailLoading ? tx("projects.loading") : undefined}
        bodyClassName="space-y-3"
      >
        {detailLoading && !detail ? (
          <div className="py-10 text-center text-sm text-[var(--admin-muted)]">{tx("projects.loading")}</div>
        ) : null}
        {detail ? (
          <>
            <AdminDetailSection title={tx("projects.basicInfo")}>
              <AdminDetailMeta
                items={[
                  {
                    label: tx("projects.user"),
                    value: (
                      <AdminEntityLink
                        kind="user"
                        id={detail.user_id}
                        label={detail.user_email ?? undefined}
                      />
                    ),
                  },
                  {
                    label: tx("projects.statusProgress"),
                    value: tx("projects.statusLine", { status: projectStatusLabel(detail.status), p: detail.progress, n: detail.shot_count }),
                  },
                  { label: tx("projects.template"), value: detail.template_id },
                  { label: tx("projects.pipeline"), value: detail.pipeline_mode },
                  { label: tx("projects.source"), value: detail.source_type || "—" },
                  {
                    label: tx("projects.resolutionRatio"),
                    value: `${detail.resolution_mode || "—"} · ${detail.output_ratio || "—"}`,
                  },
                  { label: tx("projects.voice"), value: detail.voice_id || "—", full: true },
                ]}
              />
              <AdminDetailNote empty={!detail.error_msg} className="mt-3">
                {detail.error_msg || tx("projects.errorMessage")}
              </AdminDetailNote>
            </AdminDetailSection>

            {(detail.cover_url || detail.final_video_url) ? (
              <AdminDetailSection title={tx("projects.mediaPreview")}>
                <div className="admin-detail-media">
                  {detail.cover_url ? (
                    <img src={mediaSrc(detail.cover_url)} alt={tx("projects.cover")} />
                  ) : null}
                  {detail.final_video_url ? (
                    <video src={mediaSrc(detail.final_video_url)} controls className="max-w-full" />
                  ) : null}
                </div>
              </AdminDetailSection>
            ) : null}

            <AdminDetailSection title={tx("projects.costSummary")}>
              <AdminDetailStatGrid
                items={[
                  { label: tx("projects.charged"), value: `¥${fenToYuan(usage?.charge_fen ?? detail.charge_fen ?? 0)}` },
                  { label: tx("projects.cost2"), value: `¥${fenToYuan(usage?.cost_fen ?? 0)}` },
                  { label: "Tokens", value: usage?.tokens ?? 0 },
                  {
                    label: tx("projects.imageVideoLlmTts"),
                    value: `${usage?.image_gens ?? 0}/${usage?.video_gens ?? 0}/${usage?.llm_calls ?? 0}/${usage?.tts_gens ?? 0}`,
                  },
                ]}
              />
            </AdminDetailSection>

            <AdminDetailSection title={tx("projects.shotsTitle", { n: (detail.shots ?? []).length })}>
              <AdminDetailTableWrap>
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{tx("projects.status")}</th>
                      <th>{tx("projects.duration")}</th>
                      <th>{tx("projects.image")}</th>
                      <th>{tx("projects.video")}</th>
                      <th>{tx("projects.audio")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detail.shots ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={6} className="!text-center text-[var(--admin-muted)]">
                          {tx("projects.shots2")}
                        </td>
                      </tr>
                    ) : (
                      (detail.shots ?? []).map((s) => (
                        <tr key={s.id}>
                          <td>{s.shot_no}</td>
                          <td>{s.status}</td>
                          <td>{s.duration}s</td>
                          <td>{s.has_image ? tx("projects.yes") : "—"}</td>
                          <td>{s.has_video ? tx("projects.yes") : "—"}</td>
                          <td>{s.has_audio ? tx("projects.yes") : "—"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </AdminDetailTableWrap>
            </AdminDetailSection>

            <AdminDetailSection title={tx("projects.tasksTitle", { n: (detail.recent_tasks ?? []).length })}>
              <AdminDetailTableWrap className="max-h-[200px]">
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>{tx("projects.type")}</th>
                      <th>{tx("projects.status")}</th>
                      <th>{tx("projects.chargedEstimated")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detail.recent_tasks ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="!text-center text-[var(--admin-muted)]">
                          {tx("projects.tasks")}
                        </td>
                      </tr>
                    ) : (
                      (detail.recent_tasks ?? []).map((t) => (
                        <tr key={t.id}>
                          <td>
                            <AdminEntityLink kind="task" id={t.id} />
                          </td>
                          <td>{taskTypeLabel(t.task_type)}</td>
                          <td>{taskStatusLabel(t.status)}</td>
                          <td>
                            ¥{fenToYuan(t.billing_charged_fen)} / ¥{fenToYuan(t.billing_estimate_fen)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </AdminDetailTableWrap>
            </AdminDetailSection>

            {detail.source_text ? (
              <AdminDetailSection title={tx("projects.sourceText")}>
                <AdminDetailNote>{detail.source_text}</AdminDetailNote>
              </AdminDetailSection>
            ) : null}
          </>
        ) : null}
      </AdminModal>
    </div>
  );
}
