import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api, type AdminProject, type PageMeta } from "@/api/client";
import { PaginationBar } from "@/components/PaginationBar";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/page";
import { PROJECT_STATUS_OPTIONS, projectStatusLabel, taskStatusLabel, taskTypeLabel } from "@/lib/statusLabels";
import { fenToYuan } from "@/lib/utils";

type ListRes = { items: AdminProject[]; meta: PageMeta };

// Badge color by project status
function statusBadgeVariant(status: string): "destructive" | "success" | "warning" | "info" | "secondary" {
  if (status === "FAILED" || status === "REJECTED") return "destructive";
  if (status === "DONE") return "success";
  if (status === "CANCELLED") return "secondary";
  if (status === "DRAFT") return "secondary";
  return "info";
}

// 科普项目列表与详情（镜头 / 任务 / 费用）
export function ProjectsPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListRes | null>(null);
  const [detail, setDetail] = useState<AdminProject | null>(null);

  async function load(nextPage = page) {
    try {
      const params = new URLSearchParams({ page: String(nextPage), page_size: String(DEFAULT_PAGE_SIZE) });
      if (status) params.set("status", status);
      if (q.trim()) params.set("q", q.trim());
      setData(await api<ListRes>(`/api/admin/projects?${params}`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载失败");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function openDetail(id: number) {
    try {
      setDetail(await api<AdminProject>(`/api/admin/projects/${id}`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载详情失败");
    }
  }

  const usage = detail?.usage;

  return (
    <div className="admin-list-page">
      <PageHeader description="科普管线项目：状态、镜头、关联任务与费用" />
      <div className="admin-filter-bar">
        <Select className="w-44" value={status} onChange={(e) => setStatus(e.target.value)}>
          {PROJECT_STATUS_OPTIONS.map((opt) => (
            <option key={opt.value || "all"} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
        <Input
          className="max-w-xs"
          placeholder="标题 / 错误信息"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Button
          variant="secondary"
          onClick={() => {
            setPage(1);
            void load(1);
          }}
        >
          筛选
        </Button>
      </div>
      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>标题</TableHead>
              <TableHead>用户</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>进度</TableHead>
              <TableHead>镜头</TableHead>
              <TableHead>费用</TableHead>
              <TableHead>错误</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.items ?? []).map((p) => (
              <TableRow key={p.id}>
                <TableCell>{p.id}</TableCell>
                <TableCell className="max-w-[180px] truncate">{p.title}</TableCell>
                <TableCell className="text-sm">{p.user_email ?? p.user_id}</TableCell>
                <TableCell>
                  <Badge variant={statusBadgeVariant(p.status)}>{projectStatusLabel(p.status)}</Badge>
                </TableCell>
                <TableCell>{p.progress}%</TableCell>
                <TableCell>{p.shot_count}</TableCell>
                <TableCell>¥{fenToYuan(p.charge_fen ?? 0)}</TableCell>
                <TableCell className="max-w-[220px] truncate text-xs text-red-600">
                  {p.error_msg || "—"}
                </TableCell>
                <TableCell>
                  <Button size="sm" variant="outline" onClick={() => void openDetail(p.id)}>
                    详情
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

      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              科普项目 #{detail?.id} · {detail?.title}
            </DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4 text-sm">
              <section className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground">基本信息</div>
                <div>用户：{detail.user_email ?? detail.user_id}</div>
                <div>
                  状态：{projectStatusLabel(detail.status)} · 进度 {detail.progress}% · 镜头{" "}
                  {detail.shot_count}
                </div>
                <div>模板：{detail.template_id}</div>
                <div>管线：{detail.pipeline_mode}</div>
                <div>成片：{detail.final_video_url || "—"}</div>
                <div className="rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">
                  {detail.error_msg || "无错误信息"}
                </div>
              </section>

              <section className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground">费用汇总</div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded border p-2">
                    <div className="text-[11px] text-muted-foreground">扣费</div>
                    <div>¥{fenToYuan(usage?.charge_fen ?? detail.charge_fen ?? 0)}</div>
                  </div>
                  <div className="rounded border p-2">
                    <div className="text-[11px] text-muted-foreground">成本</div>
                    <div>¥{fenToYuan(usage?.cost_fen ?? 0)}</div>
                  </div>
                  <div className="rounded border p-2">
                    <div className="text-[11px] text-muted-foreground">调用</div>
                    <div>{usage?.calls ?? 0}</div>
                  </div>
                  <div className="rounded border p-2">
                    <div className="text-[11px] text-muted-foreground">图/视/LLM/TTS</div>
                    <div>
                      {usage?.image_gens ?? 0}/{usage?.video_gens ?? 0}/{usage?.llm_calls ?? 0}/
                      {usage?.tts_gens ?? 0}
                    </div>
                  </div>
                </div>
              </section>

              <section className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground">
                  镜头（{(detail.shots ?? []).length}）
                </div>
                <div className="max-h-40 overflow-auto rounded border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left">
                        <th className="p-2">#</th>
                        <th className="p-2">状态</th>
                        <th className="p-2">图</th>
                        <th className="p-2">视频</th>
                        <th className="p-2">音频</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detail.shots ?? []).length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-2 text-center text-muted-foreground">
                            暂无镜头
                          </td>
                        </tr>
                      ) : (
                        (detail.shots ?? []).map((s) => (
                          <tr key={s.id} className="border-b">
                            <td className="p-2">{s.shot_no}</td>
                            <td className="p-2">{s.status}</td>
                            <td className="p-2">{s.has_image ? "有" : "—"}</td>
                            <td className="p-2">{s.has_video ? "有" : "—"}</td>
                            <td className="p-2">{s.has_audio ? "有" : "—"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium text-muted-foreground">
                    关联任务（最近 {(detail.recent_tasks ?? []).length}）
                  </div>
                  <Link to="/queues" className="text-xs text-primary">
                    任务中心 →
                  </Link>
                </div>
                <div className="max-h-48 overflow-auto rounded border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left">
                        <th className="p-2">ID</th>
                        <th className="p-2">类型</th>
                        <th className="p-2">状态</th>
                        <th className="p-2">已扣 / 预估</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detail.recent_tasks ?? []).length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-2 text-center text-muted-foreground">
                            暂无任务
                          </td>
                        </tr>
                      ) : (
                        (detail.recent_tasks ?? []).map((t) => (
                          <tr key={t.id} className="border-b">
                            <td className="p-2 font-mono">{t.id}</td>
                            <td className="p-2">{taskTypeLabel(t.task_type)}</td>
                            <td className="p-2">{taskStatusLabel(t.status)}</td>
                            <td className="p-2">
                              ¥{fenToYuan(t.billing_charged_fen)} / ¥{fenToYuan(t.billing_estimate_fen)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              {detail.source_text ? (
                <section>
                  <div className="mb-1 text-xs font-medium text-muted-foreground">源文本</div>
                  <div className="max-h-32 overflow-auto rounded-md border p-3 text-xs whitespace-pre-wrap">
                    {detail.source_text}
                  </div>
                </section>
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
