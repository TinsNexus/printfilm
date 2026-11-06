import { ImageOff, Loader2, Save } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AdminTemplate } from "@/api/client";
import { AdminField } from "@/components/admin/AdminField";
import { AdminModal } from "@/components/admin/AdminModal";
import { AdminSelect } from "@/components/admin/AdminSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { validateTemplateDraft } from "@/lib/templateForm";

export type TemplateFormState = {
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

type TemplateEditorDialogProps = {
  open: boolean;
  saving: boolean;
  editing: AdminTemplate | null;
  form: TemplateFormState;
  categorySuggestions?: string[];
  onOpenChange: (open: boolean) => void;
  onChange: (patch: Partial<TemplateFormState>) => void;
  onSave: () => void;
};

type EditorTab = "basic" | "prompts" | "publish";

const TABS: { id: EditorTab; label: string }[] = [
  { id: "basic", label: "Thông tin cơ bản" },
  { id: "prompts", label: "Prompt" },
  { id: "publish", label: "Cài đặt phát hành" },
];

const RATIO_OPTIONS = [
  { value: "16:9", label: "16:9 ngang" },
  { value: "9:16", label: "9:16 dọc" },
  { value: "1:1", label: "1:1 vuông" },
  { value: "4:3", label: "4:3" },
  { value: "3:4", label: "3:4" },
];

// 解析封面预览地址
function coverPreviewSrc(url: string): string {
  const trimmed = (url || "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

// 模板新建/编辑弹窗（分 Tab + 封面预览）
export function TemplateEditorDialog({
  open,
  saving,
  editing,
  form,
  categorySuggestions = [],
  onOpenChange,
  onChange,
  onSave,
}: TemplateEditorDialogProps) {
  const [tab, setTab] = useState<EditorTab>("basic");
  const [attempted, setAttempted] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const errors = validateTemplateDraft(form, !editing);
  const previewSrc = useMemo(() => coverPreviewSrc(form.preview_cover), [form.preview_cover]);
  useEffect(() => { if (open) { setTab("basic"); setAttempted(false); } }, [open]);

  function requestSave() {
    if (saving) return;
    setAttempted(true);
    if (Object.keys(errors).length) {
      setTab("basic");
      requestAnimationFrame(() => {
        const invalid = editorRef.current?.querySelector<HTMLElement>("[aria-invalid='true']");
        invalid?.focus({ preventScroll: true });
        invalid?.closest(".admin-form-field")?.scrollIntoView({ block: "center" });
      });
      return;
    }
    onSave();
  }

  const handleOpenChange = (next: boolean) => {
    if (saving) return;
    if (!next) setTab("basic");
    onOpenChange(next);
  };

  return (
    <AdminModal
      open={open}
      onOpenChange={handleOpenChange}
      size="full"
      className="template-editor-dialog max-h-[92vh] overflow-hidden"
      bodyClassName="p-0 overflow-hidden"
      title={editing ? `Chỉnh sửa mẫu · ${editing.name}` : "Tạo mẫu mới"}
      subtitle={editing ? editing.id : "Điền thông tin hiển thị và giá trị mặc định khi tạo trước, rồi cấu hình prompt và trạng thái đăng nếu cần"}
      footer={
        <>
          <Button variant="outline" disabled={saving} onClick={() => handleOpenChange(false)}>
            Hủy
          </Button>
          <Button disabled={saving} onClick={requestSave}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {saving ? "Đang lưu…" : "Lưu mẫu"}
          </Button>
        </>
      }
    >
      <div ref={editorRef} className="template-editor-layout" inert={saving}>
        <aside className="template-editor-preview">
          <div className="template-editor-preview-frame">
            {previewSrc ? (
              <img src={previewSrc} alt="Xem trước ảnh bìa" className="template-editor-preview-img" />
            ) : (
              <div className="template-editor-preview-empty">
                <ImageOff className="h-10 w-10 text-[#c0c4cc]" />
                <span>Xem trước ảnh bìa</span>
              </div>
            )}
          </div>
          <div className="settings-price-note"><strong>{form.name || "Mẫu chưa đặt tên"}</strong><br />{form.default_ratio} · {form.shot_duration_min}–{form.shot_duration_max} giây / cảnh<br />{form.is_active ? "Lưu rồi đăng hiển thị" : "Lưu ở trạng thái gỡ"}</div>
          <AdminField label="URL ảnh bìa" hint="Hỗ trợ đường dẫn tương đối (/static) hoặc HTTPS; nên dùng ảnh ngang 16:9.">
            <Input
              className="admin-input h-9"
              placeholder="/static/templates/covers/xxx.png"
              value={form.preview_cover}
              onChange={(e) => onChange({ preview_cover: e.target.value })}
            />
          </AdminField>
        </aside>

        <div className="template-editor-main">
          <div className="template-editor-tabs" role="tablist">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                className={cn("template-editor-tab", tab === item.id && "is-active")}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="template-editor-panel">
            {attempted && Object.keys(errors).length ? <div role="alert" className="template-editor-validation">Vui lòng hoàn thiện thông tin cơ bản trước:{Object.values(errors).join("；")}。</div> : null}
            {tab === "basic" ? (
              <div className="template-editor-grid">
                <h3 className="template-editor-section-title">Thông tin hiển thị</h3>
                {!editing ? (
                  <AdminField label="ID mẫu" required error={attempted ? errors.id : undefined} hint="Định danh duy nhất của mẫu, không thể sửa sau khi tạo." className="template-editor-field--full">
                    <Input
                      className="admin-input h-9"
                      placeholder="Ví dụ live_street_interview"
                      maxLength={64}
                      value={form.id}
                      onChange={(e) => onChange({ id: e.target.value })}
                    />
                  </AdminField>
                ) : null}
                <AdminField label="Tên mẫu" required error={attempted ? errors.name : undefined} hint="Hiển thị trong danh sách mẫu người dùng chọn." className="template-editor-field--full">
                  <Input
                    className="admin-input h-9"
                    maxLength={128}
                    value={form.name}
                    onChange={(e) => onChange({ name: e.target.value })}
                  />
                </AdminField>
                <AdminField label="Giới thiệu mẫu" optional hint="Mô tả ngắn chủ đề và hiệu ứng hình ảnh phù hợp." className="template-editor-field--full">
                  <Textarea
                    value={form.description}
                    onChange={(e) => onChange({ description: e.target.value })}
                    className="min-h-[88px]"
                  />
                </AdminField>
                <AdminField
                  label="Nhãn phân loại"
                  hint={
                    categorySuggestions.length
                      ? `Thường dùng: ${categorySuggestions.slice(0, 8).join("、")}${categorySuggestions.length > 8 ? "…" : ""}`
                      : "Nhiều nhãn cách nhau bằng dấu phẩy tiếng Anh."
                  }
                >
                  <Input
                    className="admin-input h-9"
                    placeholder="Chân thực,Điện ảnh,Thương mại"
                    value={form.category}
                    onChange={(e) => onChange({ category: e.target.value })}
                  />
                  {categorySuggestions.length ? <div className="template-category-suggestions">{categorySuggestions.slice(0, 8).map((category) => <button type="button" key={category} onClick={() => {
                    const current = form.category.split(/[,，]/).map((item) => item.trim()).filter(Boolean);
                    if (!current.includes(category)) onChange({ category: [...current, category].join(",") });
                  }}>+ {category}</button>)}</div> : null}
                </AdminField>
                <h3 className="template-editor-section-title">Giá trị mặc định khi tạo</h3>
                <AdminSelect
                  label="Tỷ lệ khung mặc định"
                  value={form.default_ratio}
                  options={RATIO_OPTIONS}
                  onChange={(v) => onChange({ default_ratio: v })}
                />
                <AdminField label="Thứ tự hiển thị" error={attempted ? errors.sort_order : undefined} hint="Số càng nhỏ càng đứng trước, có thể dùng số âm.">
                  <Input
                    className="admin-input h-9"
                    type="number"
                    value={form.sort_order}
                    onChange={(e) => onChange({ sort_order: Number(e.target.value) })}
                  />
                </AdminField>
                <AdminField label="Thời lượng cảnh quay ngắn nhất (giây)" required error={attempted ? errors.shot_duration_min : undefined}>
                  <Input
                    className="admin-input h-9"
                    type="number"
                    min={1}
                    step={1}
                    value={form.shot_duration_min}
                    onChange={(e) => onChange({ shot_duration_min: Number(e.target.value) })}
                  />
                </AdminField>
                <AdminField label="Thời lượng cảnh quay dài nhất (giây)" required error={attempted ? errors.shot_duration_max : undefined} hint="Không được nhỏ hơn thời lượng ngắn nhất.">
                  <Input
                    className="admin-input h-9"
                    type="number"
                    min={form.shot_duration_min || 1}
                    step={1}
                    value={form.shot_duration_max}
                    onChange={(e) => onChange({ shot_duration_max: Number(e.target.value) })}
                  />
                </AdminField>
              </div>
            ) : null}

            {tab === "prompts" ? (
              <div className="template-editor-grid template-editor-grid--prompts">
                <AdminField label="Prompt phong cách" optional hint="Mô tả phong cách hình ảnh, ánh sáng và màu sắc, sẽ làm phong cách nền cho việc tạo." className="template-editor-field--full">
                  <Textarea
                    value={form.style_prefix}
                    onChange={(e) => onChange({ style_prefix: e.target.value })}
                    className="min-h-[100px] font-mono text-[13px]"
                  />
                </AdminField>
                <AdminField label="Prompt nhân vật" optional hint="Dùng cho yêu cầu ngoại hình và trang phục trong ảnh nhân vật." className="template-editor-field--full">
                  <Textarea
                    value={form.character_prompt}
                    onChange={(e) => onChange({ character_prompt: e.target.value })}
                    className="min-h-[88px] font-mono text-[13px]"
                  />
                </AdminField>
                <AdminField label="Prompt bổ sung" optional hint="Bổ sung yêu cầu thống nhất cho việc tạo ảnh." className="template-editor-field--full">
                  <Textarea
                    value={form.extra_prompt}
                    onChange={(e) => onChange({ extra_prompt: e.target.value })}
                    className="min-h-[88px] font-mono text-[13px]"
                  />
                </AdminField>
                <AdminField label="Ghi chú bổ sung cho model văn bản" optional hint="Ghi chú kịch bản và lập kế hoạch bổ sung cho model văn bản." className="template-editor-field--full">
                  <Textarea
                    value={form.llm_system_addon}
                    onChange={(e) => onChange({ llm_system_addon: e.target.value })}
                    className="min-h-[88px] font-mono text-[13px]"
                  />
                </AdminField>
                <AdminField label="Prompt phủ định" optional hint="Liệt kê nội dung hình ảnh hoặc hiệu ứng muốn tránh xuất hiện." className="template-editor-field--full">
                  <Textarea
                    value={form.negative_prompt}
                    onChange={(e) => onChange({ negative_prompt: e.target.value })}
                    className="min-h-[88px] font-mono text-[13px]"
                  />
                </AdminField>
              </div>
            ) : null}

            {tab === "publish" ? (
              <div className="template-editor-publish">
                <div className="template-editor-publish-row">
                  <div>
                    <strong>Đăng hiển thị</strong>
                    <p>Khi tắt, người dùng sẽ không thấy trong danh sách chọn mẫu, các dự án hiện có không bị ảnh hưởng.</p>
                  </div>
                  <Switch checked={form.is_active} onCheckedChange={(v) => onChange({ is_active: v })} />
                </div>
                <div className="template-editor-publish-row">
                  <div>
                    <strong>Mẫu Premium</strong>
                    <p>Đánh dấu là mẫu cao cấp, có thể dùng để phân biệt quyền hạn hoặc chính sách tính phí.</p>
                  </div>
                  <Switch checked={form.is_premium} onCheckedChange={(v) => onChange({ is_premium: v })} />
                </div>
                {editing ? (
                  <details className="mt-4 rounded-lg border p-3">
                    <summary className="cursor-pointer text-sm font-medium">Cấu hình nâng cao (chỉ đọc)</summary>
                    <div className="mt-3 space-y-3">
                      <div>
                        <div className="mb-1 text-xs text-[var(--admin-muted)]">seedance_config</div>
                        <pre className="admin-json-readonly">
                          {JSON.stringify(editing.seedance_config ?? {}, null, 2)}
                        </pre>
                      </div>
                      <div>
                        <div className="mb-1 text-xs text-[var(--admin-muted)]">audio_config</div>
                        <pre className="admin-json-readonly">
                          {JSON.stringify(editing.audio_config ?? {}, null, 2)}
                        </pre>
                      </div>
                      <div>
                        <div className="mb-1 text-xs text-[var(--admin-muted)]">subtitle_config</div>
                        <pre className="admin-json-readonly">
                          {JSON.stringify(editing.subtitle_config ?? {}, null, 2)}
                        </pre>
                      </div>
                    </div>
                  </details>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </AdminModal>
  );
}
