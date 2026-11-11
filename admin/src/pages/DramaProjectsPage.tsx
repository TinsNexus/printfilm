import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api, type AdminDramaProject, type PageMeta } from "@/api/client";
import { AdminEntityLink } from "@/components/admin/AdminEntityLink";
import { AdminFilterBar } from "@/components/admin/AdminFilterBar";
import { AdminUserSearchSelect } from "@/components/admin/AdminUserSearchSelect";
import { PaginationBar } from "@/components/PaginationBar";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page";
import { points } from "@/lib/points";

type ListRes = { items: AdminDramaProject[]; meta: PageMeta };

/** 漫剧项目列表：点击进入二级详情页 */
export function DramaProjectsPage() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [userId, setUserId] = useState<number | null>(null);
  const [summaryStatus, setSummaryStatus] = useState("");
  const [assetsSeedStatus, setAssetsSeedStatus] = useState("");
  const [data, setData] = useState<ListRes | null>(null);

  async function load(nextPage = page) {
    try {
      const params = new URLSearchParams({ page: String(nextPage), page_size: String(DEFAULT_PAGE_SIZE) });
      if (q.trim()) params.set("q", q.trim());
      if (userId) params.set("user_id", String(userId));
      if (summaryStatus.trim()) params.set("summary_status", summaryStatus.trim());
      if (assetsSeedStatus.trim()) params.set("assets_seed_status", assetsSeedStatus.trim());
      setData(await api<ListRes>(`/api/admin/drama-projects?${params}`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Tải thất bại");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  return (
    <div className="admin-list-page">
      <PageHeader title="Dự án phim truyện" description="Dự án phim truyện: số tập, tài sản, trạng thái sản xuất và chi phí; bấm chi tiết để vào trang cấp hai" />
      <AdminFilterBar>
        <Input placeholder="Tiêu đề / mô tả" value={q} onChange={(e) => setQ(e.target.value)} />
        <AdminUserSearchSelect value={userId} onChange={(id) => setUserId(id)} />
        <Input placeholder="Trạng thái tóm tắt" value={summaryStatus} onChange={(e) => setSummaryStatus(e.target.value)} />
        <Input
          placeholder="Trạng thái trích xuất tài sản"
          value={assetsSeedStatus}
          onChange={(e) => setAssetsSeedStatus(e.target.value)}
        />
        <Button
          size="sm"
          variant="secondary"
          className="admin-filter-action"
          onClick={() => {
            setPage(1);
            void load(1);
          }}
        >
          Lọc
        </Button>
      </AdminFilterBar>
      <div className="admin-table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Tiêu đề</th>
              <th>Người dùng</th>
              <th>Số tập</th>
              <th>Tài sản</th>
              <th>Chi phí</th>
              <th>Tóm tắt</th>
              <th>Trích xuất tài sản</th>
              <th>Thời gian cập nhật</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((row) => (
              <tr key={row.id}>
                <td>{row.id}</td>
                <td className="max-w-[200px] truncate">
                  <Link to={`/drama-projects/${row.id}`} className="admin-link font-medium">
                    {row.title}
                  </Link>
                </td>
                <td>
                  <AdminEntityLink kind="user" id={row.user_id} label={row.user_email ?? undefined} />
                </td>
                <td>{row.episode_count ?? 0}</td>
                <td>{row.asset_count ?? 0}</td>
                <td>{points(row.charge_fen ?? 0)}</td>
                <td className="text-xs text-[var(--admin-muted)]">{row.summary_status || "—"}</td>
                <td className="text-xs text-[var(--admin-muted)]">{row.assets_seed_status || "—"}</td>
                <td className="text-xs text-[var(--admin-muted)]">
                  {row.updated_at ? new Date(row.updated_at).toLocaleString() : "—"}
                </td>
                <td>
                  <Button size="sm" variant="outline" asChild>
                    <Link to={`/drama-projects/${row.id}`}>Chi tiết</Link>
                  </Button>
                </td>
              </tr>
            ))}
            {(data?.items.length ?? 0) === 0 ? (
              <tr>
                <td colSpan={10} className="!text-center text-[var(--admin-muted)]">
                  Chưa có dự án
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
    </div>
  );
}
