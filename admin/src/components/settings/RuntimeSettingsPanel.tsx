import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity } from "lucide-react";
import { toast } from "sonner";
import { api, type AdminModelSettings } from "@/api/client";
import {
  LabeledControl,
  SettingsLoading,
  SettingsPanel,
  SettingsStatusBar,
  SettingsTabShell,
} from "@/components/settings/SettingsPanel";
import { Switch } from "@/components/ui/switch";
import { tr, tRich } from "@/i18n";

const NUMBER_FIELDS = [
  "seedance_duration_min", "seedance_duration_max", "ark_video_poll_interval", "ark_video_poll_timeout",
  "pipeline_image_concurrency", "pipeline_video_concurrency", "pipeline_audio_concurrency",
  "task_runtime_max_concurrency", "task_user_max_concurrency", "task_poll_max_concurrency",
  "drama_user_video_job_limit", "drama_fragment_max_attempts",
] as const;
type NumberField = (typeof NUMBER_FIELDS)[number];

// 运行参数配置（并发、质量、Mock 等 flat 字段）
export function RuntimeSettingsPanel() {
  const [form, setForm] = useState<AdminModelSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [numberDrafts, setNumberDrafts] = useState<Partial<Record<NumberField, string>>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<AdminModelSettings>("/api/admin/settings/models");
      setForm(data);
      setNumberDrafts({});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("runtime.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const statusItems = useMemo(
    () =>
      (form?.readiness ?? []).map((item) => ({
        id: item.capability,
        // 后端返回中文标签，按能力 id 本地翻译
        label: tr(`routing.cap.${item.capability}`),
        ready: item.ready,
        readyText: item.model || tr("runtime.ready"),
        pendingText: tr("runtime.notReady"),
      })),
    [form?.readiness],
  );

  function patchField<K extends keyof AdminModelSettings>(key: K, value: AdminModelSettings[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  const errors: Partial<Record<NumberField | "ark_image_size" | "ark_video_resolution" | "ark_video_ratio", string>> = {};
  if (form) {
    NUMBER_FIELDS.forEach((key) => {
      const raw = numberDrafts[key] ?? String(form[key]);
      const value = Number(raw);
      const seconds = key === "ark_video_poll_interval" || key === "ark_video_poll_timeout";
      if (!raw.trim() || !Number.isFinite(value) || value <= 0) errors[key] = seconds ? tr("runtime.errSecondsPositive") : tr("runtime.errIntMin1");
      else if (!seconds && !Number.isInteger(value)) errors[key] = tr("runtime.errInteger");
    });
    if (!errors.seedance_duration_min && !errors.seedance_duration_max && form.seedance_duration_min > form.seedance_duration_max) {
      errors.seedance_duration_max = tr("runtime.errDurationOrder");
    }
    if (!errors.ark_video_poll_interval && !errors.ark_video_poll_timeout && form.ark_video_poll_timeout <= form.ark_video_poll_interval) {
      errors.ark_video_poll_timeout = tr("runtime.errTimeoutOrder");
    }
    (["ark_image_size", "ark_video_resolution", "ark_video_ratio"] as const).forEach((key) => {
      if (!form[key].trim()) errors[key] = tr("runtime.errDefaultRequired");
    });
  }
  const hasErrors = Object.keys(errors).length > 0;

  function numberField(key: NumberField, label: string, hint: string, unit: string) {
    if (!form) return null;
    const seconds = key === "ark_video_poll_interval" || key === "ark_video_poll_timeout";
    return (
      <LabeledControl label={label} hint={hint} error={errors[key]} required>
        <div className="relative">
          <input
            className="settings-input !pr-12"
            type="number" required min={seconds ? 0 : 1} step={seconds ? "any" : 1}
            aria-invalid={Boolean(errors[key])}
            value={numberDrafts[key] ?? form[key]}
            onChange={(event) => {
              const raw = event.target.value;
              setNumberDrafts((prev) => ({ ...prev, [key]: raw }));
              if (raw.trim() && Number.isFinite(Number(raw))) patchField(key, Number(raw));
            }}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--admin-muted)]">{unit}</span>
        </div>
      </LabeledControl>
    );
  }

  async function handleSave() {
    if (!form || saving || hasErrors) return;
    setSaving(true);
    try {
      const body = {
        ark_image_size: form.ark_image_size,
        ark_video_resolution: form.ark_video_resolution,
        ark_video_ratio: form.ark_video_ratio,
        seedance_duration_min: form.seedance_duration_min,
        seedance_duration_max: form.seedance_duration_max,
        ark_video_poll_interval: form.ark_video_poll_interval,
        ark_video_poll_timeout: form.ark_video_poll_timeout,
        pipeline_image_concurrency: form.pipeline_image_concurrency,
        pipeline_video_concurrency: form.pipeline_video_concurrency,
        pipeline_audio_concurrency: form.pipeline_audio_concurrency,
        task_runtime_max_concurrency: form.task_runtime_max_concurrency,
        task_user_max_concurrency: form.task_user_max_concurrency,
        task_poll_max_concurrency: form.task_poll_max_concurrency,
        drama_user_video_job_limit: form.drama_user_video_job_limit,
        drama_fragment_max_attempts: form.drama_fragment_max_attempts,
        ark_mock: form.ark_mock,
      };
      await api("/api/admin/settings/models", { method: "PATCH", body: JSON.stringify(body) });
      await load();
      toast.success(tr("runtime.saved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("runtime.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  if (loading || !form) {
    return <SettingsLoading />;
  }

  return (
    <SettingsTabShell onSave={handleSave} saving={saving} disabled={hasErrors} saveLabel={tr("runtime.saveLabel")}>
      <SettingsStatusBar
        title={tr("runtime.routeReadiness")}
        items={
          statusItems.length > 0
            ? statusItems
            : [{ id: "empty", label: tr("runtime.capabilityRoutes"), ready: false, pendingText: tr("runtime.needModelsFirst") }]
        }
        extra={
          <span className="settings-status-extra">
            {form.readiness?.length && form.readiness.every((item) => item.ready) ? tr("runtime.allReady") : tr("runtime.needTokenfreeKey")}
          </span>
        }
      />

      <SettingsPanel title={tr("runtime.defaultsTitle")} description={tr("runtime.defaultsDesc")}>
        <div className="settings-field-grid settings-field-grid--3">
          <LabeledControl label={tr("runtime.imageSize")} hint={tr("runtime.imageSizeHint")} error={errors.ark_image_size} required>
            <input className="settings-input" required placeholder={tr("runtime.imageSizePlaceholder")} aria-invalid={Boolean(errors.ark_image_size)} value={form.ark_image_size} onChange={(e) => patchField("ark_image_size", e.target.value)} />
          </LabeledControl>
          <LabeledControl label={tr("runtime.videoResolution")} hint={tr("runtime.videoResolutionHint")} error={errors.ark_video_resolution} required>
            <input className="settings-input" required placeholder={tr("runtime.videoResolutionPlaceholder")} aria-invalid={Boolean(errors.ark_video_resolution)} value={form.ark_video_resolution} onChange={(e) => patchField("ark_video_resolution", e.target.value)} />
          </LabeledControl>
          <LabeledControl label={tr("runtime.videoRatio")} hint={tr("runtime.videoRatioHint")} error={errors.ark_video_ratio} required>
            <input className="settings-input" required placeholder={tr("runtime.videoRatioPlaceholder")} aria-invalid={Boolean(errors.ark_video_ratio)} value={form.ark_video_ratio} onChange={(e) => patchField("ark_video_ratio", e.target.value)} />
          </LabeledControl>
        </div>
        <div className="settings-field-grid settings-field-grid--2 mt-5">
          {numberField("seedance_duration_min", tr("runtime.seedanceMin"), tr("runtime.seedanceMinHint"), tr("runtime.unitSeconds"))}
          {numberField("seedance_duration_max", tr("runtime.seedanceMax"), tr("runtime.seedanceMaxHint"), tr("runtime.unitSeconds"))}
        </div>
      </SettingsPanel>

      <SettingsPanel title={tr("runtime.concurrencyTitle")} description={tr("runtime.concurrencyDesc")}>
        <div className="settings-field-grid settings-field-grid--3">
          {numberField("task_runtime_max_concurrency", tr("runtime.siteSlots"), tr("runtime.siteSlotsHint"), "")}
          {numberField("task_user_max_concurrency", tr("runtime.userSlots"), tr("runtime.userSlotsHint"), "")}
          {numberField("drama_user_video_job_limit", tr("runtime.dramaVideoLimit"), tr("runtime.dramaVideoLimitHint"), "")}
        </div>
        <div className="settings-runtime-note mt-5">
          <Activity className="h-4 w-4 shrink-0 text-[var(--admin-forest)]" />
          <span>{tRich(tr("runtime.draftSummary"), { site: <strong>{form.task_runtime_max_concurrency}</strong>, user: <strong>{form.task_user_max_concurrency}</strong> })}</span>
        </div>
      </SettingsPanel>

      <details className="settings-advanced">
        <summary><span>{tr("runtime.advancedTitle")}</span><span>{tr("runtime.advancedSummary")}</span></summary>
        <SettingsPanel title={tr("runtime.pipelinesTitle")} description={tr("runtime.pipelinesDesc")}>
          <div className="settings-field-grid settings-field-grid--3">
            {numberField("pipeline_image_concurrency", tr("runtime.imageConcurrency"), tr("runtime.imageConcurrencyHint"), tr("runtime.unitWorkers"))}
            {numberField("pipeline_video_concurrency", tr("runtime.videoConcurrency"), tr("runtime.videoConcurrencyHint"), tr("runtime.unitWorkers"))}
            {numberField("pipeline_audio_concurrency", tr("runtime.voiceConcurrency"), tr("runtime.voiceConcurrencyHint"), tr("runtime.unitWorkers"))}
          </div>
        </SettingsPanel>
        <SettingsPanel title={tr("runtime.pollingTitle")} description={tr("runtime.pollingDesc")}>
          <div className="settings-field-grid settings-field-grid--2">
            {numberField("ark_video_poll_interval", tr("runtime.pollInterval"), tr("runtime.pollIntervalHint"), tr("runtime.unitSeconds"))}
            {numberField("ark_video_poll_timeout", tr("runtime.pollTimeout"), tr("runtime.pollTimeoutHint"), tr("runtime.unitSeconds"))}
            {numberField("task_poll_max_concurrency", tr("runtime.pollConcurrency"), tr("runtime.pollConcurrencyHint"), tr("runtime.unitWorkers"))}
            {numberField("drama_fragment_max_attempts", tr("runtime.fragmentMaxAttempts"), tr("runtime.fragmentMaxAttemptsHint"), tr("runtime.unitTimes"))}
          </div>
        </SettingsPanel>
        <SettingsPanel title={tr("runtime.devTitle")} description={tr("runtime.devDesc")}>
          <div className="settings-toggle-row">
            <div><strong>{tr("runtime.arkMock")}</strong><span>{tr("runtime.arkMockHint")}</span></div>
            <Switch aria-label={tr("runtime.arkMock")} checked={form.ark_mock} onCheckedChange={(v) => patchField("ark_mock", v)} />
          </div>
        </SettingsPanel>
      </details>
    </SettingsTabShell>
  );
}
