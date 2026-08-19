import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, type AdminTemplate, type PageMeta } from "@/api/client";
import { PaginationBar } from "@/components/PaginationBar";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type ListRes = { items: AdminTemplate[]; meta: PageMeta };

type FormState = {
  id: string;
  name: string;
  description: string;
  category: string;
  preview_cover: string;
  style_prefix: string;
  character_prompt: string;
  extra_prompt: string;
  negative_prompt: string;
  default_ratio: string;
  shot_duration_min: number;
  shot_duration_max: number;
  llm_system_addon: string;
  sort_order: number;
  is_active: boolean;
  is_premium: boolean;
};

const emptyForm = (): FormState => ({
  id: "",
  name: "",
  description: "",
  category: "",
  preview_cover: "",
  style_prefix: "",
  character_prompt: "",
  extra_prompt: "",
  negative_prompt: "",
  default_ratio: "16:9",
  shot_duration_min: 3,
  shot_duration_max: 8,
  llm_system_addon: "",
  sort_order: 0,
  is_active: true,
  is_premium: false,
});

// 从 seedream_config 读取角色/额外提示词
function seedreamText(cfg: Record<string, unknown> | undefined, key: string): string {
  const value = cfg?.[key];
  return typeof value === "string" ? value : "";
}

// Template CRUD with active / premium toggles
export function TemplatesPage() {
  /*
   * page current page
   * data list response
   * open dialog visibility
   * editing existing template or null for create
   * form form fields
   * saving request in flight
   */
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListRes | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AdminTemplate | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);

  // Load templates
  async function load(nextPage = page) {
    try {
      const params = new URLSearchParams({ page: String(nextPage), page_size: String(DEFAULT_PAGE_SIZE) });
      setData(await api<ListRes>(`/api/admin/templates?${params}`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载失败");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Open create dialog
  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setOpen(true);
  }

  // Open edit dialog
  function openEdit(tpl: AdminTemplate) {
    setEditing(tpl);
    setForm({
      id: tpl.id,
      name: tpl.name,
      description: tpl.description,
      category: (tpl.category || []).join(","),
      preview_cover: tpl.preview_cover,
      style_prefix: tpl.style_prefix,
      character_prompt: seedreamText(tpl.seedream_config, "character_prompt"),
      extra_prompt: seedreamText(tpl.seedream_config, "extra_prompt"),
      negative_prompt: tpl.negative_prompt,
      default_ratio: tpl.default_ratio,
      shot_duration_min: tpl.shot_duration_min,
      shot_duration_max: tpl.shot_duration_max,
      llm_system_addon: tpl.llm_system_addon,
      sort_order: tpl.sort_order,
      is_active: tpl.is_active,
      is_premium: tpl.is_premium,
    });
    setOpen(true);
  }

  // Create or update template
  async function save() {
    setSaving(true);
    try {
      const category = form.category
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (editing) {
        await api(`/api/admin/templates/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: form.name,
            description: form.description,
            category,
            preview_cover: form.preview_cover,
            style_prefix: form.style_prefix,
            negative_prompt: form.negative_prompt,
            default_ratio: form.default_ratio,
            shot_duration_min: form.shot_duration_min,
            shot_duration_max: form.shot_duration_max,
            llm_system_addon: form.llm_system_addon,
            sort_order: form.sort_order,
            is_active: form.is_active,
            is_premium: form.is_premium,
            seedream_config: {
              ...(editing.seedream_config || {}),
              character_prompt: form.character_prompt,
              extra_prompt: form.extra_prompt,
            },
          }),
        });
      } else {
        if (!form.id.trim()) throw new Error("请填写模板 ID");
        await api(`/api/admin/templates`, {
          method: "POST",
          body: JSON.stringify({
            id: form.id.trim(),
            name: form.name,
            description: form.description,
            category,
            preview_cover: form.preview_cover,
            style_prefix: form.style_prefix,
            negative_prompt: form.negative_prompt,
            default_ratio: form.default_ratio,
            shot_duration_min: form.shot_duration_min,
            shot_duration_max: form.shot_duration_max,
            llm_system_addon: form.llm_system_addon,
            sort_order: form.sort_order,
            is_active: form.is_active,
            is_premium: form.is_premium,
            seedream_config: {
              character_prompt: form.character_prompt,
              extra_prompt: form.extra_prompt,
            },
            seedance_config: {},
            audio_config: {},
            subtitle_config: {},
          }),
        });
      }
      toast.success("已保存");
      setOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  // Toggle active / premium quickly
  async function quickPatch(id: string, body: Partial<AdminTemplate>) {
    try {
      await api(`/api/admin/templates/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "更新失败");
    }
  }

  // Delete template if unused
  async function remove(id: string) {
    if (!window.confirm(`确认删除模板 ${id}？`)) return;
    try {
      await api(`/api/admin/templates/${id}`, { method: "DELETE" });
      toast.success("已删除");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-[#303133]">模板管理</h2>
          <p className="mt-1 text-sm text-[#909399]">
            风格 / 角色 / 额外提示词以本页为准；启动不再用代码覆盖。已创建项目若曾单独改过，需在分镜页恢复模板后才会跟随。
          </p>
        </div>
        <Button onClick={openCreate}>新建模板</Button>
      </div>
      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>名称</TableHead>
              <TableHead>排序</TableHead>
              <TableHead>上架</TableHead>
              <TableHead>Premium</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.items ?? []).map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-mono text-xs">{t.id}</TableCell>
                <TableCell>{t.name}</TableCell>
                <TableCell>{t.sort_order}</TableCell>
                <TableCell>
                  <Switch
                    checked={t.is_active}
                    onCheckedChange={(v) => void quickPatch(t.id, { is_active: v })}
                  />
                </TableCell>
                <TableCell>
                  <Switch
                    checked={t.is_premium}
                    onCheckedChange={(v) => void quickPatch(t.id, { is_premium: v })}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => openEdit(t)}>
                      编辑
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void remove(t.id)}>
                      删除
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `编辑模板 · ${editing.id}` : "新建模板"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {!editing && (
              <div className="space-y-2 sm:col-span-2">
                <Label>ID</Label>
                <Input value={form.id} onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))} />
              </div>
            )}
            <div className="space-y-2 sm:col-span-2">
              <Label>名称</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>描述</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>分类（逗号分隔）</Label>
              <Input
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>封面 URL</Label>
              <Input
                value={form.preview_cover}
                onChange={(e) => setForm((f) => ({ ...f, preview_cover: e.target.value }))}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>风格提示词</Label>
              <Textarea
                value={form.style_prefix}
                onChange={(e) => setForm((f) => ({ ...f, style_prefix: e.target.value }))}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>角色提示词</Label>
              <Textarea
                value={form.character_prompt}
                onChange={(e) => setForm((f) => ({ ...f, character_prompt: e.target.value }))}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>额外提示词</Label>
              <Textarea
                value={form.extra_prompt}
                onChange={(e) => setForm((f) => ({ ...f, extra_prompt: e.target.value }))}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>LLM 附加说明</Label>
              <Textarea
                value={form.llm_system_addon}
                onChange={(e) => setForm((f) => ({ ...f, llm_system_addon: e.target.value }))}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>负面提示词</Label>
              <Textarea
                value={form.negative_prompt}
                onChange={(e) => setForm((f) => ({ ...f, negative_prompt: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>画幅</Label>
              <Input
                value={form.default_ratio}
                onChange={(e) => setForm((f) => ({ ...f, default_ratio: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>排序</Label>
              <Input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-2">
              <Label>时长 min</Label>
              <Input
                type="number"
                value={form.shot_duration_min}
                onChange={(e) => setForm((f) => ({ ...f, shot_duration_min: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-2">
              <Label>时长 max</Label>
              <Input
                type="number"
                value={form.shot_duration_max}
                onChange={(e) => setForm((f) => ({ ...f, shot_duration_max: Number(e.target.value) }))}
              />
            </div>
            <div className="flex items-center justify-between sm:col-span-1">
              <Label>上架</Label>
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
              />
            </div>
            <div className="flex items-center justify-between sm:col-span-1">
              <Label>Premium</Label>
              <Switch
                checked={form.is_premium}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_premium: v }))}
              />
            </div>
          </div>
          <Button className="mt-2 w-full" disabled={saving} onClick={() => void save()}>
            {saving ? "保存中…" : "保存"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
