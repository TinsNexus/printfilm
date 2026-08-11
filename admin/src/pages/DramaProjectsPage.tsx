import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, type PageMeta } from "@/api/client";
import { PaginationBar } from "@/components/PaginationBar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
  /*
   * page current page
   * data list response
   */
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
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">漫剧项目</h1>
        <p className="text-sm text-muted-foreground">查看用户创建的漫剧项目</p>
      </div>
      <div className="rounded-lg border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>标题</TableHead>
              <TableHead>用户</TableHead>
              <TableHead>创建时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.items || []).map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.id}</TableCell>
                <TableCell>{row.title}</TableCell>
                <TableCell>{row.user_email || row.user_id}</TableCell>
                <TableCell>{row.created_at ? String(row.created_at).slice(0, 19) : "-"}</TableCell>
              </TableRow>
            ))}
            {!data?.items?.length ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  暂无数据
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
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
