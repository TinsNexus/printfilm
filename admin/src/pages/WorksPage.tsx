import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, type AdminWork, type PageMeta } from "@/api/client";
import { PaginationBar } from "@/components/PaginationBar";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/page";
import { auditStatusLabel, visibilityLabel } from "@/lib/statusLabels";

type ListRes = { items: AdminWork[]; meta: PageMeta };

// Work audit: visibility + audit_status
export function WorksPage() {
  /*
   * auditStatus filter
   * visibility filter
   * page current page
   * data list response
   */
  const [auditStatus, setAuditStatus] = useState("");
  const [visibility, setVisibility] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListRes | null>(null);

  // Load works
  async function load(nextPage = page) {
    try {
      const params = new URLSearchParams({ page: String(nextPage), page_size: String(DEFAULT_PAGE_SIZE) });
      if (auditStatus) params.set("audit_status", auditStatus);
      if (visibility) params.set("visibility", visibility);
      setData(await api<ListRes>(`/api/admin/works?${params}`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载失败");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Patch a work field
  async function patchWork(id: number, body: { visibility?: string; audit_status?: string }) {
    try {
      await api(`/api/admin/works/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      toast.success("已更新");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "更新失败");
    }
  }

  return (
    <div className="admin-list-page">
      <PageHeader description="调整可见性与审核状态" />
      <div className="admin-filter-bar">
        <Select className="w-40" value={auditStatus} onChange={(e) => setAuditStatus(e.target.value)}>
          <option value="">全部审核</option>
          <option value="pending">待审核</option>
          <option value="passed">已通过</option>
          <option value="rejected">已拒绝</option>
        </Select>
        <Select className="w-40" value={visibility} onChange={(e) => setVisibility(e.target.value)}>
          <option value="">全部可见性</option>
          <option value="public">公开</option>
          <option value="private">私密</option>
          <option value="unlisted">不公开列出</option>
        </Select>
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
              <TableHead>可见性</TableHead>
              <TableHead>审核</TableHead>
              <TableHead>发布时间</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.items ?? []).map((w) => (
              <TableRow key={w.id}>
                <TableCell>{w.id}</TableCell>
                <TableCell className="max-w-[200px] truncate">{w.title}</TableCell>
                <TableCell>{w.user_email ?? w.user_id}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{visibilityLabel(w.visibility)}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={w.audit_status === "rejected" ? "destructive" : w.audit_status === "passed" ? "success" : "warning"}>
                    {auditStatusLabel(w.audit_status)}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(w.published_at).toLocaleString()}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="outline" onClick={() => void patchWork(w.id, { audit_status: "passed" })}>
                      通过
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void patchWork(w.id, { audit_status: "rejected" })}
                    >
                      拒绝
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void patchWork(w.id, {
                          visibility: w.visibility === "public" ? "private" : "public",
                        })
                      }
                    >
                      {w.visibility === "public" ? "设私密" : "设公开"}
                    </Button>
                  </div>
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
    </div>
  );
}
