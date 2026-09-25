import {
  LabeledControl,
  SettingsLoading,
  SettingsPanel,
  SettingsStatusBar,
  SettingsTabShell,
} from "@/components/settings/SettingsPanel";
import { useAdminModelSettings } from "@/hooks/useAdminModelSettings";
import { useI18n } from "@/i18n";

/** 站点公网地址与媒体工具路径 */
export function SiteSettingsPanel() {
  const { t: tx } = useI18n();
  const { form, loading, saving, patchField, save } = useAdminModelSettings();

  async function handleSave() {
    if (!form) return;
    await save(
      {
        public_base_url: form.public_base_url,
        ffmpeg_path: form.ffmpeg_path,
        ffprobe_path: form.ffprobe_path,
      },
      tx("siteSettings.siteSettingsSaved"),
    );
  }

  if (loading || !form) {
    return <SettingsLoading />;
  }

  const hasPublic = Boolean(form.public_base_url?.trim());
  const hasFfmpeg = Boolean(form.ffmpeg_path?.trim());
  const hasFfprobe = Boolean(form.ffprobe_path?.trim());

  return (
    <SettingsTabShell onSave={() => void handleSave()} saving={saving}>
      <SettingsStatusBar
        title={tx("siteSettings.siteToolStatus")}
        items={[
          {
            id: "public",
            label: tx("siteSettings.publicUrl"),
            ready: hasPublic,
            readyText: tx("siteSettings.configured"),
            pendingText: tx("siteSettings.set"),
          },
          {
            id: "ffmpeg",
            label: "ffmpeg",
            ready: hasFfmpeg,
            readyText: form.ffmpeg_path || tx("siteSettings.configured"),
            pendingText: tx("siteSettings.usingDefaultPath"),
          },
          {
            id: "ffprobe",
            label: "ffprobe",
            ready: hasFfprobe,
            readyText: form.ffprobe_path || tx("siteSettings.configured"),
            pendingText: tx("siteSettings.usingDefaultPath"),
          },
        ]}
      />

      <div className="settings-routing-grid">
        <SettingsPanel
          className="settings-panel--compact"
          title={tx("siteSettings.1PublicUrl")}
          description={tx("siteSettings.paymentCallbacksShareLinks")}
        >
          <div className="settings-field-grid">
            <LabeledControl
              label={tx("siteSettings.backendPublicBaseUrl")}
              hint={tx("siteSettings.eGHttpsWww")}
              className="settings-field-span-full"
            >
              <input
                className="settings-input"
                value={form.public_base_url}
                onChange={(e) => patchField("public_base_url", e.target.value)}
              />
            </LabeledControl>
          </div>
          <p className="settings-panel-footnote">
            {tx("siteSettings.infrastructureSuchDatabaseRedis")}
          </p>
        </SettingsPanel>

        <SettingsPanel
          className="settings-panel--compact"
          title={tx("siteSettings.2MediaTools")}
          description={tx("siteSettings.compositingFrameExtractionRely")}
        >
          <div className="settings-field-grid">
            <LabeledControl label={tx("siteSettings.ffmpegPath")}>
              <input
                className="settings-input"
                placeholder="ffmpeg"
                value={form.ffmpeg_path}
                onChange={(e) => patchField("ffmpeg_path", e.target.value)}
              />
            </LabeledControl>
            <LabeledControl label={tx("siteSettings.ffprobePath")}>
              <input
                className="settings-input"
                placeholder="ffprobe"
                value={form.ffprobe_path}
                onChange={(e) => patchField("ffprobe_path", e.target.value)}
              />
            </LabeledControl>
          </div>
        </SettingsPanel>
      </div>
    </SettingsTabShell>
  );
}
