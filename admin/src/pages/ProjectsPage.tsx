import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, type AdminProject, type PageMeta } from "@/api/client";
import { PaginationBar } from "@/components/PaginationBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type ListRes = { items: AdminProject[]; meta: PageMeta };

const STATUS_OPTIONS = [
  "",
  "DRAFT",
  "SCRIPTING",
  "FAILED",
  "DONE",
  "CANCELLED",
  "VIDEOING",
  "COMPOSING",
];

// Project list and failure detail
export function ProjectsPage() {
  /*
   * q title/error search
   * status status filter
   * page current page
   * data list response
   * detail selected project detail
   */
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListRes | null>(null);
  const [detail, setDetail] = useState<AdminProject | null>(null);

  // Load projects
  async function load(nextPage = page) {
    try {
      const params = new URLSearchParams({ page: String(nextPage), page_size: "20" });
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

  // Fetch project detail for triage
  async function openDetail(id: number) {
    try {
      setDetail(await api<AdminProject>(`/api/admin/projects/${id}`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载详情失败");
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">项目管理</h1>
        <p className="text-sm text-muted-foreground">按状态筛选，查看失败原因与进度</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Select className="w-44" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS_OPTIONS.map((s) => (
            <option key={s || "all"} value={s}>
              {s || "全部状态"}
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
                  <Badge variant={p.status === "FAILED" ? "destructive" : "secondary"}>{p.status}</Badge>
                </TableCell>
                <TableCell>{p.progress}%</TableCell>
                <TableCell>{p.shot_count}</TableCell>
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              项目 #{detail?.id} · {detail?.title}
            </DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-2 text-sm">
              <div>用户：{detail.user_email ?? detail.user_id}</div>
              <div>
                状态：{detail.status} · 进度 {detail.progress}% · 镜头 {detail.shot_count}
              </div>
              <div>模板：{detail.template_id}</div>
              <div>管线：{detail.pipeline_mode}</div>
              <div>成片：{detail.final_video_url || "—"}</div>
              <div className="rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">
                {detail.error_msg || "无错误信息"}
              </div>
              {detail.source_text && (
                <div className="max-h-40 overflow-auto rounded-md border p-3 text-xs whitespace-pre-wrap">
                  {detail.source_text}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
