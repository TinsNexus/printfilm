import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api, type AdminDramaProject, type PageMeta } from "@/api/client";
import { PaginationBar } from "@/components/PaginationBar";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page";
import { taskStatusLabel, taskTypeLabel } from "@/lib/statusLabels";
import { fenToYuan } from "@/lib/utils";

type ListRes = { items: AdminDramaProject[]; meta: PageMeta };

/** Admin drama projects with filters and detail dialog */
export function DramaProjectsPage() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [userId, setUserId] = useState("");
  const [data, setData] = useState<ListRes | null>(null);
  const [detail, setDetail] = useState<AdminDramaProject | null>(null);

  async function load(nextPage = page) {
    try {
      const params = new URLSearchParams({ page: String(nextPage), page_size: String(DEFAULT_PAGE_SIZE) });
      if (q.trim()) params.set("q", q.trim());
      if (userId.trim()) params.set("user_id", userId.trim());
      setData(await api<ListRes>(`/api/admin/drama-projects?${params}`));
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
      setDetail(await api<AdminDramaProject>(`/api/admin/drama-projects/${id}`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载详情失败");
    }
  }

  const usage = detail?.usage;

  return (
    <div className="admin-list-page">
      <PageHeader description="漫剧项目：集数、资产、生产状态、费用与关联任务" />
      <div className="admin-filter-bar">
        <Input
          className="max-w-xs"
          placeholder="标题 / 描述"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Input
          className="w-32"
          placeholder="用户 ID"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
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
      <div className="admin-table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>标题</th>
              <th>用户</th>
              <th>集数</th>
              <th>资产</th>
              <th>费用</th>
              <th>摘要</th>
              <th>创建时间</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((row) => (
              <tr key={row.id}>
                <td>{row.id}</td>
                <td className="max-w-[200px] truncate">{row.title}</td>
                <td>{row.user_email ?? row.user_id}</td>
                <td>{row.episode_count ?? 0}</td>
                <td>{row.asset_count ?? 0}</td>
                <td>¥{fenToYuan(row.charge_fen ?? 0)}</td>
                <td className="text-xs text-[var(--admin-muted)]">{row.summary_status || "—"}</td>
                <td className="text-xs text-[var(--admin-muted)]">
                  {row.created_at ? new Date(row.created_at).toLocaleString() : "—"}
                </td>
                <td>
                  <Button size="sm" variant="outline" onClick={() => void openDetail(row.id)}>
                    详情
                  </Button>
                </td>
              </tr>
            ))}
            {(data?.items.length ?? 0) === 0 ? (
              <tr>
                <td colSpan={9} className="!text-center text-[var(--admin-muted)]">
                  暂无项目
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {data?.meta ? (
        <PaginationBar
          page={data.meta.page}
          pageSize={data.meta.page_size}
          total={data.meta.total}
          onPageChange={setPage}
        />
      ) : null}

      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              漫剧 #{detail?.id} · {detail?.title}
            </DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4 text-sm">
              <section className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground">基本信息</div>
                <div>用户：{detail.user_email ?? detail.user_id}</div>
                <div>{detail.description || "无描述"}</div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded border px-2 py-0.5">摘要 {detail.summary_status || "—"}</span>
                  <span className="rounded border px-2 py-0.5">
                    分集 {detail.episode_content_status || "—"}
                  </span>
                  <span className="rounded border px-2 py-0.5">
                    资产抽取 {detail.assets_seed_status || "—"}
                  </span>
                  <span className="rounded border px-2 py-0.5">集 {detail.episode_count ?? 0}</span>
                  <span className="rounded border px-2 py-0.5">资产 {detail.asset_count ?? 0}</span>
                  <span className="rounded border px-2 py-0.5">分镜 {detail.fragment_count ?? 0}</span>
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
                  集列表（{(detail.episodes ?? []).length}）
                </div>
                <div className="max-h-36 overflow-auto rounded border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left">
                        <th className="p-2">ID</th>
                        <th className="p-2">名称</th>
                        <th className="p-2">分镜数</th>
                        <th className="p-2">分镜状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detail.episodes ?? []).length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-2 text-center text-muted-foreground">
                            暂无集
                          </td>
                        </tr>
                      ) : (
                        (detail.episodes ?? []).map((ep) => (
                          <tr key={ep.id} className="border-b">
                            <td className="p-2">{ep.id}</td>
                            <td className="p-2">{ep.name}</td>
                            <td className="p-2">{ep.fragment_count}</td>
                            <td className="p-2">{ep.fragment_plan_status || "—"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground">
                  资产摘要（{(detail.assets ?? []).length}）
                </div>
                <div className="max-h-36 overflow-auto rounded border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left">
                        <th className="p-2">ID</th>
                        <th className="p-2">类型</th>
                        <th className="p-2">名称</th>
                        <th className="p-2">封面</th>
                        <th className="p-2">生成</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detail.assets ?? []).length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-2 text-center text-muted-foreground">
                            暂无资产
                          </td>
                        </tr>
                      ) : (
                        (detail.assets ?? []).map((a) => (
                          <tr key={a.id} className="border-b">
                            <td className="p-2">{a.id}</td>
                            <td className="p-2">{a.type}</td>
                            <td className="max-w-[120px] truncate p-2">{a.name || "—"}</td>
                            <td className="p-2">{a.has_cover ? "有" : "—"}</td>
                            <td className="p-2">{a.generation_status || "—"}</td>
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
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
