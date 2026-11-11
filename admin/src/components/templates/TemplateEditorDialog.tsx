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
import { tr } from "../../i18n/translate.ts";

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
  { id: "basic", get label() { return tr("templates.ui.tabBasic"); } },
  { id: "prompts", get label() { return tr("templates.ui.tabPrompts"); } },
  { id: "publish", get label() { return tr("templates.ui.tabPublish"); } },
];

const RATIO_OPTIONS = [
  { value: "16:9", get label() { return tr("templates.ui.ratioLandscape"); } },
  { value: "9:16", get label() { return tr("templates.ui.ratioPortrait"); } },
  { value: "1:1", get label() { return tr("templates.ui.ratioSquare"); } },
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
      title={editing ? tr("templates.ui.editTitle", { name: editing.name }) : tr("templates.ui.newTemplate")}
      subtitle={editing ? editing.id : tr("templates.ui.newSubtitle")}
      footer={
        <>
          <Button variant="outline" disabled={saving} onClick={() => handleOpenChange(false)}>
            {tr("templates.ui.cancel")}
          </Button>
          <Button disabled={saving} onClick={requestSave}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {saving ? tr("templates.ui.saving") : tr("templates.ui.save")}
          </Button>
        </>
      }
    >
      <div ref={editorRef} className="template-editor-layout" inert={saving}>
        <aside className="template-editor-preview">
          <div className="template-editor-preview-frame">
            {previewSrc ? (
              <img src={previewSrc} alt={tr("templates.ui.coverPreview")} className="template-editor-preview-img" />
            ) : (
              <div className="template-editor-preview-empty">
                <ImageOff className="h-10 w-10 text-[#c0c4cc]" />
                <span>{tr("templates.ui.coverPreview")}</span>
              </div>
            )}
          </div>
          <div className="settings-price-note"><strong>{form.name || tr("templates.ui.unnamed")}</strong><br />{form.default_ratio} · {tr("templates.ui.durPerShot", { min: form.shot_duration_min, max: form.shot_duration_max })}<br />{form.is_active ? tr("templates.ui.saveListed") : tr("templates.ui.saveUnlisted")}</div>
          <AdminField label={tr("templates.ui.coverUrl")} hint={tr("templates.ui.coverUrlHint")}>
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
            {attempted && Object.keys(errors).length ? <div role="alert" className="template-editor-validation">{tr("templates.ui.fixBasics", { errors: Object.values(errors).join(tr("templates.ui.listSep")) })}</div> : null}
            {tab === "basic" ? (
              <div className="template-editor-grid">
                <h3 className="template-editor-section-title">{tr("templates.ui.secDisplay")}</h3>
                {!editing ? (
                  <AdminField label={tr("templates.ui.id")} required error={attempted ? errors.id : undefined} hint={tr("templates.ui.idHint")} className="template-editor-field--full">
                    <Input
                      className="admin-input h-9"
                      placeholder={tr("templates.ui.idPlaceholder")}
                      maxLength={64}
                      value={form.id}
                      onChange={(e) => onChange({ id: e.target.value })}
                    />
                  </AdminField>
                ) : null}
                <AdminField label={tr("templates.ui.name")} required error={attempted ? errors.name : undefined} hint={tr("templates.ui.nameHint")} className="template-editor-field--full">
                  <Input
                    className="admin-input h-9"
                    maxLength={128}
                    value={form.name}
                    onChange={(e) => onChange({ name: e.target.value })}
                  />
                </AdminField>
                <AdminField label={tr("templates.ui.desc")} optional hint={tr("templates.ui.descHint")} className="template-editor-field--full">
                  <Textarea
                    value={form.description}
                    onChange={(e) => onChange({ description: e.target.value })}
                    className="min-h-[88px]"
                  />
                </AdminField>
                <AdminField
                  label={tr("templates.ui.categories")}
                  hint={
                    categorySuggestions.length
                      ? tr("templates.ui.commonTags", { tags: categorySuggestions.slice(0, 8).join(tr("templates.ui.tagSep")) + (categorySuggestions.length > 8 ? "…" : "") })
                      : tr("templates.ui.categoriesHint")
                  }
                >
                  <Input
                    className="admin-input h-9"
                    placeholder={tr("templates.ui.categoriesPlaceholder")}
                    value={form.category}
                    onChange={(e) => onChange({ category: e.target.value })}
                  />
                  {categorySuggestions.length ? <div className="template-category-suggestions">{categorySuggestions.slice(0, 8).map((category) => <button type="button" key={category} onClick={() => {
                    const current = form.category.split(/[,，]/).map((item) => item.trim()).filter(Boolean);
                    if (!current.includes(category)) onChange({ category: [...current, category].join(",") });
                  }}>+ {category}</button>)}</div> : null}
                </AdminField>
                <h3 className="template-editor-section-title">{tr("templates.ui.secDefaults")}</h3>
                <AdminSelect
                  label={tr("templates.ui.defaultRatio")}
                  value={form.default_ratio}
                  options={RATIO_OPTIONS}
                  onChange={(v) => onChange({ default_ratio: v })}
                />
                <AdminField label={tr("templates.ui.sortOrder")} error={attempted ? errors.sort_order : undefined} hint={tr("templates.ui.sortOrderHint")}>
                  <Input
                    className="admin-input h-9"
                    type="number"
                    value={form.sort_order}
                    onChange={(e) => onChange({ sort_order: Number(e.target.value) })}
                  />
                </AdminField>
                <AdminField label={tr("templates.ui.durMin")} required error={attempted ? errors.shot_duration_min : undefined}>
                  <Input
                    className="admin-input h-9"
                    type="number"
                    min={1}
                    step={1}
                    value={form.shot_duration_min}
                    onChange={(e) => onChange({ shot_duration_min: Number(e.target.value) })}
                  />
                </AdminField>
                <AdminField label={tr("templates.ui.durMax")} required error={attempted ? errors.shot_duration_max : undefined} hint={tr("templates.ui.durMaxHint")}>
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
                <AdminField label={tr("templates.ui.stylePrompt")} optional hint={tr("templates.ui.stylePromptHint")} className="template-editor-field--full">
                  <Textarea
                    value={form.style_prefix}
                    onChange={(e) => onChange({ style_prefix: e.target.value })}
                    className="min-h-[100px] font-mono text-[13px]"
                  />
                </AdminField>
                <AdminField label={tr("templates.ui.characterPrompt")} optional hint={tr("templates.ui.characterPromptHint")} className="template-editor-field--full">
                  <Textarea
                    value={form.character_prompt}
                    onChange={(e) => onChange({ character_prompt: e.target.value })}
                    className="min-h-[88px] font-mono text-[13px]"
                  />
                </AdminField>
                <AdminField label={tr("templates.ui.extraPrompt")} optional hint={tr("templates.ui.extraPromptHint")} className="template-editor-field--full">
                  <Textarea
                    value={form.extra_prompt}
                    onChange={(e) => onChange({ extra_prompt: e.target.value })}
                    className="min-h-[88px] font-mono text-[13px]"
                  />
                </AdminField>
                <AdminField label={tr("templates.ui.llmNotes")} optional hint={tr("templates.ui.llmNotesHint")} className="template-editor-field--full">
                  <Textarea
                    value={form.llm_system_addon}
                    onChange={(e) => onChange({ llm_system_addon: e.target.value })}
                    className="min-h-[88px] font-mono text-[13px]"
                  />
                </AdminField>
                <AdminField label={tr("templates.ui.negativePrompt")} optional hint={tr("templates.ui.negativePromptHint")} className="template-editor-field--full">
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
                    <strong>{tr("templates.ui.listed")}</strong>
                    <p>{tr("templates.ui.listedHint")}</p>
                  </div>
                  <Switch checked={form.is_active} onCheckedChange={(v) => onChange({ is_active: v })} />
                </div>
                <div className="template-editor-publish-row">
                  <div>
                    <strong>{tr("templates.ui.premium")}</strong>
                    <p>{tr("templates.ui.premiumHint")}</p>
                  </div>
                  <Switch checked={form.is_premium} onCheckedChange={(v) => onChange({ is_premium: v })} />
                </div>
                {editing ? (
                  <details className="mt-4 rounded-lg border p-3">
                    <summary className="cursor-pointer text-sm font-medium">{tr("templates.ui.advancedReadonly")}</summary>
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
