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
import { tRich, useI18n } from "@/i18n";

// 运行参数配置（并发、质量、Mock 等 flat 字段）
export function RuntimeSettingsPanel() {
  const { t: tx } = useI18n();
  const [form, setForm] = useState<AdminModelSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<AdminModelSettings>("/api/admin/settings/models");
      setForm(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tx("runtimeSettings.failedLoad"));
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
        label: item.label,
        ready: item.ready,
        readyText: item.model || tx("runtimeSettings.ready"),
        pendingText: tx("runtimeSettings.ready2"),
      })),
    [form?.readiness],
  );

  function patchField<K extends keyof AdminModelSettings>(key: K, value: AdminModelSettings[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function handleSave() {
    if (!form) return;
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
      toast.success(tx("runtimeSettings.runtimeSettingsSaved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tx("runtimeSettings.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  if (loading || !form) {
    return <SettingsLoading />;
  }

  return (
    <SettingsTabShell onSave={() => void handleSave()} saving={saving}>
      <SettingsStatusBar
        title={tx("runtimeSettings.routingReadiness")}
        items={
          statusItems.length > 0
            ? statusItems
            : [{ id: "empty", label: tx("runtimeSettings.capabilityRouting"), ready: false, pendingText: tx("runtimeSettings.firstEnterKeyPick") }]
        }
        extra={
          <span className="settings-status-extra">
            {form.readiness?.every((item) => item.ready) ? tx("runtimeSettings.allFourCapabilitiesReady") : tx("runtimeSettings.enterTokenfreeKeyPick")}
          </span>
        }
      />

      <div className="settings-routing-grid">
        <SettingsPanel
          className="settings-panel--compact"
          title={tx("runtimeSettings.1QualityDefaults")}
          description={tx("runtimeSettings.imageSizeVideoResolution")}
        >
          <div className="settings-field-grid">
            <LabeledControl label={tx("runtimeSettings.defaultImageSize")}>
              <input
                className="settings-input"
                value={form.ark_image_size}
                onChange={(e) => patchField("ark_image_size", e.target.value)}
              />
            </LabeledControl>
            <LabeledControl label={tx("runtimeSettings.defaultVideoResolution")}>
              <input
                className="settings-input"
                value={form.ark_video_resolution}
                onChange={(e) => patchField("ark_video_resolution", e.target.value)}
              />
            </LabeledControl>
            <LabeledControl label={tx("runtimeSettings.defaultVideoRatio")}>
              <input
                className="settings-input"
                value={form.ark_video_ratio}
                onChange={(e) => patchField("ark_video_ratio", e.target.value)}
              />
            </LabeledControl>
            <LabeledControl label={tx("runtimeSettings.seedanceMinDurationS")}>
              <input
                className="settings-input"
                type="number"
                min={1}
                value={form.seedance_duration_min}
                onChange={(e) => patchField("seedance_duration_min", Number(e.target.value))}
              />
            </LabeledControl>
            <LabeledControl label={tx("runtimeSettings.seedanceMaxDurationS")}>
              <input
                className="settings-input"
                type="number"
                min={1}
                value={form.seedance_duration_max}
                onChange={(e) => patchField("seedance_duration_max", Number(e.target.value))}
              />
            </LabeledControl>
            <LabeledControl label={tx("runtimeSettings.videoPollIntervalS")}>
              <input
                className="settings-input"
                type="number"
                step="0.5"
                value={form.ark_video_poll_interval}
                onChange={(e) => patchField("ark_video_poll_interval", Number(e.target.value))}
              />
            </LabeledControl>
            <LabeledControl label={tx("runtimeSettings.videoPollTimeoutS")}>
              <input
                className="settings-input"
                type="number"
                value={form.ark_video_poll_timeout}
                onChange={(e) => patchField("ark_video_poll_timeout", Number(e.target.value))}
              />
            </LabeledControl>
          </div>
        </SettingsPanel>

        <SettingsPanel
          className="settings-panel--compact"
          title={tx("runtimeSettings.2ConcurrencyLimits")}
          description={tx("runtimeSettings.pipelineConcurrencyTaskSlots")}
        >
          <div className="settings-field-grid">
            <LabeledControl label={tx("runtimeSettings.imageConcurrency")}>
              <input
                className="settings-input"
                type="number"
                min={1}
                value={form.pipeline_image_concurrency}
                onChange={(e) => patchField("pipeline_image_concurrency", Number(e.target.value))}
              />
            </LabeledControl>
            <LabeledControl label={tx("runtimeSettings.videoConcurrency")}>
              <input
                className="settings-input"
                type="number"
                min={1}
                value={form.pipeline_video_concurrency}
                onChange={(e) => patchField("pipeline_video_concurrency", Number(e.target.value))}
              />
            </LabeledControl>
            <LabeledControl label={tx("runtimeSettings.voiceConcurrency")}>
              <input
                className="settings-input"
                type="number"
                min={1}
                value={form.pipeline_audio_concurrency}
                onChange={(e) => patchField("pipeline_audio_concurrency", Number(e.target.value))}
              />
            </LabeledControl>
            <LabeledControl label={tx("runtimeSettings.taskPlatformSlotsSite")}>
              <input
                className="settings-input"
                type="number"
                min={1}
                value={form.task_runtime_max_concurrency}
                onChange={(e) => patchField("task_runtime_max_concurrency", Number(e.target.value))}
              />
            </LabeledControl>
            <LabeledControl label={tx("runtimeSettings.perUserTaskSlots")}>
              <input
                className="settings-input"
                type="number"
                min={1}
                value={form.task_user_max_concurrency}
                onChange={(e) => patchField("task_user_max_concurrency", Number(e.target.value))}
              />
            </LabeledControl>
            <LabeledControl label={tx("runtimeSettings.selectorPollConcurrency")}>
              <input
                className="settings-input"
                type="number"
                min={1}
                value={form.task_poll_max_concurrency}
                onChange={(e) => patchField("task_poll_max_concurrency", Number(e.target.value))}
              />
            </LabeledControl>
            <LabeledControl label={tx("runtimeSettings.perUserFlightDrama")}>
              <input
                className="settings-input"
                type="number"
                min={1}
                value={form.drama_user_video_job_limit}
                onChange={(e) => patchField("drama_user_video_job_limit", Number(e.target.value))}
              />
            </LabeledControl>
            <LabeledControl label={tx("runtimeSettings.maxAttemptsPerShot")}>
              <input
                className="settings-input"
                type="number"
                min={1}
                value={form.drama_fragment_max_attempts}
                onChange={(e) => patchField("drama_fragment_max_attempts", Number(e.target.value))}
              />
            </LabeledControl>
          </div>
          <div className="settings-toggle-row mt-3">
            <div>
              <strong>{tx("runtimeSettings.arkMockMode")}</strong>
              <span>{tx("runtimeSettings.simulatesGenerationDevelopmentWithout")}</span>
            </div>
            <Switch checked={form.ark_mock} onCheckedChange={(v) => patchField("ark_mock", v)} />
          </div>
        </SettingsPanel>
      </div>

      <SettingsPanel className="settings-panel--compact" title={tx("runtimeSettings.3RuntimeSummary")} description={tx("runtimeSettings.currentlyEffectiveWorkerSelector")}>
        <div className="settings-runtime-summary">
          <div className="settings-runtime-summary-row">
            <Activity className="h-4 w-4 text-[var(--admin-forest)]" />
            <span>
              {tRich(tx("runtimeSettings.workerSummary"), { w: <strong>{form.task_runtime_max_concurrency}</strong>, u: <strong>{form.task_user_max_concurrency}</strong> })}
            </span>
          </div>
          <p className="settings-runtime-summary-hint">
            {tx("runtimeSettings.pollNote", { n: form.task_poll_max_concurrency })}
          </p>
        </div>
      </SettingsPanel>
    </SettingsTabShell>
  );
}
