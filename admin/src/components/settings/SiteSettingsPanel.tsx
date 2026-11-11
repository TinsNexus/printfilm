import {
  LabeledControl,
  SettingsLoading,
  SettingsPanel,
  SettingsStatusBar,
  SettingsTabShell,
} from "@/components/settings/SettingsPanel";
import { Switch } from "@/components/ui/switch";
import { useAdminModelSettings } from "@/hooks/useAdminModelSettings";
import { tr } from "@/i18n";

/** 站点公网地址与媒体工具路径 */
export function SiteSettingsPanel() {
  const { form, loading, saving, patchField, save } = useAdminModelSettings();

  async function handleSave() {
    if (!form) return;
    await save(
      {
        public_base_url: form.public_base_url,
        ffmpeg_path: form.ffmpeg_path,
        ffprobe_path: form.ffprobe_path,
        marketplace_enabled: form.marketplace_enabled,
        marketplace_app_enabled: form.marketplace_app_enabled,
        marketplace_social_initialization_enabled: form.marketplace_social_initialization_enabled,
        marketplace_sharing_enabled: form.marketplace_sharing_enabled,
        marketplace_share_base_url: (form.marketplace_share_base_url || '').trim(),
        marketplace_share_apple_team_id: (form.marketplace_share_apple_team_id || '').trim(),
        marketplace_share_android_package_name: (form.marketplace_share_android_package_name || '').trim(),
        marketplace_share_android_sha256_fingerprints: (form.marketplace_share_android_sha256_fingerprints || '').trim(),
        marketplace_max_duration_seconds: form.marketplace_max_duration_seconds,
      },
      tr("siteSettings.saved"),
    );
  }

  if (loading || !form) {
    return <SettingsLoading />;
  }

  const hasPublic = Boolean(form.public_base_url?.trim());
  const hasFfmpeg = Boolean(form.ffmpeg_path?.trim());
  const hasFfprobe = Boolean(form.ffprobe_path?.trim());

  return (
    <SettingsTabShell onSave={handleSave} saving={saving} saveLabel={tr("siteSettings.saveLabel")}>
      <SettingsStatusBar
        title={tr("siteSettings.statusTitle")}
        items={[
          {
            id: "public",
            label: tr("siteSettings.publicUrl"),
            ready: hasPublic,
            readyText: tr("siteSettings.configured"),
            pendingText: tr("siteSettings.notFilled"),
          },
          {
            id: "ffmpeg",
            label: "ffmpeg",
            ready: hasFfmpeg,
            readyText: form.ffmpeg_path || tr("siteSettings.configured"),
            pendingText: tr("siteSettings.defaultPath"),
          },
          {
            id: "ffprobe",
            label: "ffprobe",
            ready: hasFfprobe,
            readyText: form.ffprobe_path || tr("siteSettings.configured"),
            pendingText: tr("siteSettings.defaultPath"),
          },
          {
            id: "marketplace",
            label: tr("siteSettings.marketplace"),
            ready: form.marketplace_enabled,
            readyText: tr("siteSettings.on"),
            pendingText: tr("siteSettings.off"),
          },
          {
            id: "marketplace-app",
            label: tr("siteSettings.appVideo"),
            ready: form.marketplace_app_enabled,
            readyText: tr("siteSettings.on"),
            pendingText: tr("siteSettings.off"),
          },
        ]}
      />

      <div className="settings-routing-grid">
        <SettingsPanel
          className="settings-panel--compact"
          title={tr("siteSettings.accessTitle")}
          description={tr("siteSettings.accessDesc")}
        >
          <div className="settings-field-grid">
            <LabeledControl
              label={tr("siteSettings.publicBaseUrl")}
              hint={tr("siteSettings.publicBaseUrlHint")}
              optional
              className="settings-field-span-full"
            >
              <input
                className="settings-input"
                type="url"
                placeholder="https://www.printfilm.com"
                autoComplete="url"
                value={form.public_base_url}
                onChange={(e) => patchField("public_base_url", e.target.value)}
              />
            </LabeledControl>
          </div>
          <p className="settings-panel-footnote">
            {tr("siteSettings.infraEnvNote")}
          </p>
        </SettingsPanel>

        <SettingsPanel
          className="settings-panel--compact"
          title={tr("siteSettings.mediaToolsTitle")}
          description={tr("siteSettings.mediaToolsDesc")}
        >
          <div className="settings-field-grid">
            <LabeledControl label={tr("siteSettings.ffmpeg")} hint={tr("siteSettings.ffmpegHint")} optional>
              <input
                className="settings-input"
                placeholder="ffmpeg"
                value={form.ffmpeg_path}
                onChange={(e) => patchField("ffmpeg_path", e.target.value)}
              />
            </LabeledControl>
            <LabeledControl label={tr("siteSettings.ffprobe")} hint={tr("siteSettings.ffprobeHint")} optional>
              <input
                className="settings-input"
                placeholder="ffprobe"
                value={form.ffprobe_path}
                onChange={(e) => patchField("ffprobe_path", e.target.value)}
              />
            </LabeledControl>
          </div>
        </SettingsPanel>

        <SettingsPanel
          className="settings-panel--compact"
          title={tr("siteSettings.marketplaceSection")}
          description={tr("siteSettings.marketplaceSectionDesc")}
        >
          <div className="settings-toggle-row">
            <div>
              <strong>{tr("siteSettings.enableMarketplace")}</strong>
              <span>{tr("siteSettings.enableMarketplaceHint")}</span>
            </div>
            <Switch
              checked={form.marketplace_enabled}
              onCheckedChange={(value) => patchField("marketplace_enabled", value)}
            />
          </div>
          <div className="settings-toggle-row">
            <div>
              <strong>{tr("siteSettings.enableAppVideo")}</strong>
              <span>{tr("siteSettings.enableAppVideoHint")}</span>
            </div>
            <Switch
              checked={form.marketplace_app_enabled}
              onCheckedChange={(value) => patchField("marketplace_app_enabled", value)}
            />
          </div>
          <LabeledControl
            label={tr("siteSettings.maxVideoDuration")}
            hint={tr("siteSettings.maxVideoDurationHint")}
          >
            <input
              className="settings-input"
              type="number"
              min={1}
              max={86400}
              step={1}
              value={form.marketplace_max_duration_seconds}
              onChange={(e) => patchField("marketplace_max_duration_seconds", Number(e.target.value))}
            />
          </LabeledControl>
        </SettingsPanel>
        <SettingsPanel className="settings-panel--compact" title={tr("siteSettings.appShareTitle")} description={tr("siteSettings.appShareDesc")}>
          <div className="settings-toggle-row"><div><strong>{tr("siteSettings.autoSeedEngagement")}</strong><span>{tr("siteSettings.autoSeedEngagementHint")}</span></div><Switch checked={form.marketplace_social_initialization_enabled ?? false} onCheckedChange={value => patchField("marketplace_social_initialization_enabled", value)} /></div>
          <div className="settings-toggle-row"><div><strong>{tr("siteSettings.enableSharing")}</strong><span>{tr("siteSettings.enableSharingHint")}</span></div><Switch checked={form.marketplace_sharing_enabled ?? false} onCheckedChange={value => patchField("marketplace_sharing_enabled", value)} /></div>
          <div className="settings-field-grid">
            <LabeledControl label={tr("siteSettings.shareBaseUrl")} hint={tr("siteSettings.shareBaseUrlHint")} className="settings-field-span-full"><input className="settings-input" type="url" value={form.marketplace_share_base_url ?? ''} onChange={event => patchField("marketplace_share_base_url", event.target.value)} placeholder="https://www.printfilm.com" /></LabeledControl>
            <LabeledControl label="Apple Team ID" hint={tr("siteSettings.appleTeamIdHint")}><input className="settings-input" value={form.marketplace_share_apple_team_id ?? ''} maxLength={10} onChange={event => patchField("marketplace_share_apple_team_id", event.target.value)} placeholder="ABCDEFGHIJ" /></LabeledControl>
            <LabeledControl label={tr("siteSettings.androidPackage")} hint={tr("siteSettings.androidPackageHint")}><input className="settings-input" value={form.marketplace_share_android_package_name ?? ''} maxLength={255} onChange={event => patchField("marketplace_share_android_package_name", event.target.value)} placeholder="com.example.app" /></LabeledControl>
            <LabeledControl label={tr("siteSettings.androidFingerprints")} hint={tr("siteSettings.androidFingerprintsHint")} className="settings-field-span-full"><textarea className="settings-input" rows={4} maxLength={10000} value={form.marketplace_share_android_sha256_fingerprints ?? ''} onChange={event => patchField("marketplace_share_android_sha256_fingerprints", event.target.value)} placeholder={tr("siteSettings.androidFingerprintsPlaceholder")} /></LabeledControl>
            <LabeledControl label="iOS Bundle ID" hint={tr("siteSettings.iosBundleHint")}><input className="settings-input" readOnly value={form.apple_bundle_id || tr("siteSettings.iosNotConfigured")} /></LabeledControl>
          </div>
          <p className="settings-panel-footnote">{tr("siteSettings.appLinksNote")}</p>
        </SettingsPanel>
      </div>
    </SettingsTabShell>
  );
}
