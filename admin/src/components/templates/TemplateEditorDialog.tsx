import { ImageOff, Loader2, Save } from "lucide-react";
import { useMemo, useState } from "react";
import type { AdminTemplate } from "@/api/client";
import { AdminField } from "@/components/admin/AdminField";
import { AdminModal } from "@/components/admin/AdminModal";
import { AdminSelect } from "@/components/admin/AdminSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { tr } from "@/i18n/translate";

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
  { id: "basic", get label() { return tr("templateEditor.basics") } },
  { id: "prompts", get label() { return tr("templateEditor.prompts") } },
  { id: "publish", get label() { return tr("templateEditor.publishing") } },
];

const RATIO_OPTIONS = [
  { value: "16:9", get label() { return tr("templateEditor.169Landscape") } },
  { value: "9:16", get label() { return tr("templateEditor.916Portrait") } },
  { value: "1:1", get label() { return tr("templateEditor.11Square") } },
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
  const { t: tx } = useI18n();
  const [tab, setTab] = useState<EditorTab>("basic");
  const previewSrc = useMemo(() => coverPreviewSrc(form.preview_cover), [form.preview_cover]);

  const handleOpenChange = (next: boolean) => {
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
      title={editing ? tx("templateEditor.editTemplate", { editingName: editing.name }) : tx("templateEditor.newTemplate")}
      subtitle={editing ? editing.id : tx("templateEditor.fillBasicsPromptsChanges")}
      footer={
        <>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {tx("templateEditor.cancel")}
          </Button>
          <Button disabled={saving} onClick={onSave}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {saving ? tx("templateEditor.saving") : tx("templateEditor.saveTemplate")}
          </Button>
        </>
      }
    >
      <div className="template-editor-layout">
        <aside className="template-editor-preview">
          <div className="template-editor-preview-frame">
            {previewSrc ? (
              <img src={previewSrc} alt={tx("templateEditor.coverPreview")} className="template-editor-preview-img" />
            ) : (
              <div className="template-editor-preview-empty">
                <ImageOff className="h-10 w-10 text-[#c0c4cc]" />
                <span>{tx("templateEditor.coverPreview")}</span>
              </div>
            )}
          </div>
          <AdminField label={tx("templateEditor.coverUrl")} hint={tx("templateEditor.relativePathsStaticHttps")}>
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
            {tab === "basic" ? (
              <div className="template-editor-grid">
                {!editing ? (
                  <AdminField label={tx("templateEditor.templateId")} className="template-editor-field--full">
                    <Input
                      className="admin-input h-9"
                      placeholder={tx("templateEditor.eGLiveStreet")}
                      value={form.id}
                      onChange={(e) => onChange({ id: e.target.value })}
                    />
                  </AdminField>
                ) : null}
                <AdminField label={tx("templateEditor.name")} className="template-editor-field--full">
                  <Input
                    className="admin-input h-9"
                    value={form.name}
                    onChange={(e) => onChange({ name: e.target.value })}
                  />
                </AdminField>
                <AdminField label={tx("templateEditor.description")} className="template-editor-field--full">
                  <Textarea
                    value={form.description}
                    onChange={(e) => onChange({ description: e.target.value })}
                    className="min-h-[88px]"
                  />
                </AdminField>
                <AdminField
                  label={tx("templateEditor.categoriesCommaSeparated")}
                  hint={
                    categorySuggestions.length
                      ? tx("templateEditor.commonCats", { list: `${categorySuggestions.slice(0, 8).join(tx("templateEditor.listSep"))}${categorySuggestions.length > 8 ? "…" : ""}` })
                      : undefined
                  }
                >
                  <Input
                    className="admin-input h-9"
                    placeholder="真人感,电影感,商业"
                    value={form.category}
                    onChange={(e) => onChange({ category: e.target.value })}
                  />
                </AdminField>
                <AdminSelect
                  label={tx("templateEditor.defaultAspectRatio")}
                  value={form.default_ratio}
                  options={RATIO_OPTIONS}
                  onChange={(v) => onChange({ default_ratio: v })}
                />
                <AdminField label={tx("templateEditor.sortOrder")}>
                  <Input
                    className="admin-input h-9"
                    type="number"
                    value={form.sort_order}
                    onChange={(e) => onChange({ sort_order: Number(e.target.value) })}
                  />
                </AdminField>
                <AdminField label={tx("templateEditor.shotDurationMinS")}>
                  <Input
                    className="admin-input h-9"
                    type="number"
                    value={form.shot_duration_min}
                    onChange={(e) => onChange({ shot_duration_min: Number(e.target.value) })}
                  />
                </AdminField>
                <AdminField label={tx("templateEditor.shotDurationMaxS")}>
                  <Input
                    className="admin-input h-9"
                    type="number"
                    value={form.shot_duration_max}
                    onChange={(e) => onChange({ shot_duration_max: Number(e.target.value) })}
                  />
                </AdminField>
              </div>
            ) : null}

            {tab === "prompts" ? (
              <div className="template-editor-grid template-editor-grid--prompts">
                <AdminField label={tx("templateEditor.stylePrompt")} className="template-editor-field--full">
                  <Textarea
                    value={form.style_prefix}
                    onChange={(e) => onChange({ style_prefix: e.target.value })}
                    className="min-h-[100px] font-mono text-[13px]"
                  />
                </AdminField>
                <AdminField label={tx("templateEditor.characterPrompt")} className="template-editor-field--full">
                  <Textarea
                    value={form.character_prompt}
                    onChange={(e) => onChange({ character_prompt: e.target.value })}
                    className="min-h-[88px] font-mono text-[13px]"
                  />
                </AdminField>
                <AdminField label={tx("templateEditor.extraPrompt")} className="template-editor-field--full">
                  <Textarea
                    value={form.extra_prompt}
                    onChange={(e) => onChange({ extra_prompt: e.target.value })}
                    className="min-h-[88px] font-mono text-[13px]"
                  />
                </AdminField>
                <AdminField label={tx("templateEditor.llmSystemAddendum")} className="template-editor-field--full">
                  <Textarea
                    value={form.llm_system_addon}
                    onChange={(e) => onChange({ llm_system_addon: e.target.value })}
                    className="min-h-[88px] font-mono text-[13px]"
                  />
                </AdminField>
                <AdminField label={tx("templateEditor.negativePrompt")} className="template-editor-field--full">
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
                    <strong>{tx("templateEditor.listed")}</strong>
                    <p>{tx("templateEditor.whenOffTemplateHidden")}</p>
                  </div>
                  <Switch checked={form.is_active} onCheckedChange={(v) => onChange({ is_active: v })} />
                </div>
                <div className="template-editor-publish-row">
                  <div>
                    <strong>{tx("templateEditor.premiumTemplate")}</strong>
                    <p>{tx("templateEditor.marksPremiumTemplateUsable")}</p>
                  </div>
                  <Switch checked={form.is_premium} onCheckedChange={(v) => onChange({ is_premium: v })} />
                </div>
                {editing ? (
                  <details className="mt-4 rounded-lg border p-3">
                    <summary className="cursor-pointer text-sm font-medium">{tx("templateEditor.advancedConfigurationReadOnly")}</summary>
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
