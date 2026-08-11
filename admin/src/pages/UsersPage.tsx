import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, type AdminUserRow, type PageMeta } from "@/api/client";
import { PaginationBar } from "@/components/PaginationBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, PageHeader, Toolbar } from "@/components/ui/page";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { fenToYuan } from "@/lib/utils";

type ListRes = { items: AdminUserRow[]; meta: PageMeta };

// User management: search, plan, balance, unlimited
export function UsersPage() {
  /*
   * q search query
   * page current page
   * pageSize rows per page
   * data list response
   * loading fetch state
   * editing user being edited
   * form edit form state
   * saving patch in flight
   */
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [data, setData] = useState<ListRes | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<AdminUserRow | null>(null);
  const [form, setForm] = useState({
    plan: "free",
    billing_unlimited: false,
    role: "user",
    balance_yuan: "0",
    balance_note: "",
  });
  const [saving, setSaving] = useState(false);

  // Load paginated users
  async function load(nextPage = page, nextQ = q, nextSize = pageSize) {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        page_size: String(nextSize),
      });
      if (nextQ.trim()) params.set("q", nextQ.trim());
      const res = await api<ListRes>(`/api/admin/users?${params}`);
      setData(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  // Open edit dialog for a user
  function openEdit(user: AdminUserRow) {
    setEditing(user);
    setForm({
      plan: user.plan || "free",
      billing_unlimited: !!user.billing_unlimited,
      role: user.role || "user",
      balance_yuan: fenToYuan(user.balance_fen),
      balance_note: "",
    });
  }

  // Save user patch
  async function saveEdit() {
    if (!editing) return;
    setSaving(true);
    try {
      const balanceFen = Math.round(parseFloat(form.balance_yuan || "0") * 100);
      if (Number.isNaN(balanceFen)) throw new Error("余额格式无效");
      await api(`/api/admin/users/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          plan: form.plan,
          billing_unlimited: form.billing_unlimited,
          role: form.role,
          balance_fen: balanceFen,
          balance_note: form.balance_note || undefined,
        }),
      });
      toast.success("已保存");
      setEditing(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="用户管理" description="搜索用户，调整套餐、余额与无限额度" />

      <Toolbar>
        <Input
          className="max-w-xs"
          placeholder="搜索邮箱 / 昵称"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setPage(1);
              void load(1, q);
            }
          }}
        />
        <Button
          variant="soft"
          onClick={() => {
            setPage(1);
            void load(1, q);
          }}
        >
          搜索
        </Button>
      </Toolbar>

      <div className="space-y-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>邮箱</TableHead>
              <TableHead>昵称</TableHead>
              <TableHead>套餐</TableHead>
              <TableHead>余额</TableHead>
              <TableHead>角色</TableHead>
              <TableHead>无限</TableHead>
              <TableHead className="w-[100px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.items ?? []).map((u) => (
              <TableRow key={u.id}>
                <TableCell className="text-[#909399]">{u.id}</TableCell>
                <TableCell className="font-medium">{u.email}</TableCell>
                <TableCell>{u.nickname}</TableCell>
                <TableCell>
                  <Badge variant="info">{u.plan}</Badge>
                </TableCell>
                <TableCell className="tabular-nums">¥{fenToYuan(u.balance_fen)}</TableCell>
                <TableCell>
                  <Badge variant={u.role === "admin" ? "success" : "secondary"}>{u.role}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={u.billing_unlimited ? "warning" : "secondary"}>
                    {u.billing_unlimited ? "是" : "否"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button size="sm" variant="outline" onClick={() => openEdit(u)}>
                    编辑
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!loading && (data?.items.length ?? 0) === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="p-0">
                  <EmptyState title="暂无用户" description="试试换个关键词搜索" />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {data && (
          <PaginationBar
            page={data.meta.page}
            pageSize={pageSize}
            total={data.meta.total}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        )}
      </div>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑用户</DialogTitle>
            <DialogDescription>{editing?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>套餐</Label>
              <Select value={form.plan} onChange={(e) => setForm((f) => ({ ...f, plan: e.target.value }))}>
                <option value="free">free</option>
                <option value="pro">pro</option>
                <option value="team">team</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>角色</Label>
              <Select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
                <option value="user">user</option>
                <option value="admin">admin</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>余额（元）</Label>
              <Input
                value={form.balance_yuan}
                onChange={(e) => setForm((f) => ({ ...f, balance_yuan: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>调账备注</Label>
              <Input
                value={form.balance_note}
                onChange={(e) => setForm((f) => ({ ...f, balance_note: e.target.value }))}
                placeholder="可选"
              />
            </div>
            <div className="flex items-center justify-between rounded-xl bg-[#fafbfc] px-3 py-3">
              <div>
                <Label>无限额度</Label>
                <p className="mt-1 text-xs text-[#909399]">billing_unlimited</p>
              </div>
              <Switch
                checked={form.billing_unlimited}
                onCheckedChange={(v) => setForm((f) => ({ ...f, billing_unlimited: v }))}
              />
            </div>
            <Button className="w-full" disabled={saving} onClick={() => void saveEdit()}>
              {saving ? "保存中…" : "保存修改"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
