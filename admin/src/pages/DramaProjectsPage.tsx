import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, type PageMeta } from "@/api/client";
import { PaginationBar } from "@/components/PaginationBar";
import { PageHeader } from "@/components/ui/page";

type DramaProjectRow = {
  id: number;
  user_id: number;
  user_email?: string | null;
  title: string;
  description?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ListRes = { items: DramaProjectRow[]; meta: PageMeta };

/** Admin table listing drama projects with pagination */
export function DramaProjectsPage() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListRes | null>(null);

  // Load drama projects
  async function load(nextPage = page) {
    try {
      const params = new URLSearchParams({ page: String(nextPage), page_size: "20" });
      setData(await api<ListRes>(`/api/admin/drama-projects?${params}`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载失败");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  return (
    <div className="admin-list-page">
      <PageHeader description="查看用户创建的漫剧项目" />
      <div className="admin-table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>标题</th>
              <th>用户</th>
              <th>创建时间</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((row) => (
              <tr key={row.id}>
                <td>{row.id}</td>
                <td>{row.title}</td>
                <td>{row.user_email ?? row.user_id}</td>
                <td className="text-xs text-[var(--admin-muted)]">
                  {row.created_at ? new Date(row.created_at).toLocaleString() : "—"}
                </td>
              </tr>
            ))}
            {(data?.items.length ?? 0) === 0 ? (
              <tr>
                <td colSpan={4} className="!text-center text-[var(--admin-muted)]">
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
    </div>
  );
}
