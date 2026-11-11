import { useState } from "react";
import { LabeledControl, SettingsLoading, SettingsPanel, SettingsStatusBar, SettingsTabShell } from "@/components/settings/SettingsPanel";
import { SecretField } from "@/components/settings/SecretField";
import { Switch } from "@/components/ui/switch";
import { useAdminModelSettings } from "@/hooks/useAdminModelSettings";
import { tr } from "@/i18n";

export function OssSettingsPanel() {
  const { form, loading, saving, patchField, save } = useAdminModelSettings();
  const [ossKeyIdInput, setOssKeyIdInput] = useState("");
  const [ossKeySecretInput, setOssKeySecretInput] = useState("");
  const [clearOssId, setClearOssId] = useState(false);
  const [clearOssSecret, setClearOssSecret] = useState(false);

  async function handleSave() {
    if (!form) return;
    const saved = await save({
      oss_enabled: form.oss_enabled,
      oss_endpoint: form.oss_endpoint.trim(),
      oss_region: form.oss_region.trim(),
      oss_bucket: form.oss_bucket.trim(),
      oss_folder: form.oss_folder.trim(),
      oss_public_base: form.oss_public_base.trim(),
      oss_upload_async: form.oss_upload_async,
      oss_upload_queue: form.oss_upload_queue.trim(),
      oss_access_key_id: clearOssId ? undefined : ossKeyIdInput.trim() || undefined,
      oss_access_key_secret: clearOssSecret ? undefined : ossKeySecretInput.trim() || undefined,
      clear_oss_access_key_id: clearOssId,
      clear_oss_access_key_secret: clearOssSecret,
    }, tr("oss.saved"));
    if (!saved) return;
    setOssKeyIdInput("");
    setOssKeySecretInput("");
    setClearOssId(false);
    setClearOssSecret(false);
  }

  if (loading || !form) return <SettingsLoading />;

  const endpoint = form.oss_endpoint.trim().replace(/^https?:\/\//i, "").replace(/\/$/, "");
  const endpointError = form.oss_endpoint.trim() && !/^[a-z\d.-]+(?::\d+)?$/i.test(endpoint)
    ? tr("oss.errEndpoint") : undefined;
  const bucketError = form.oss_bucket.trim() && !/^[a-z\d-]+$/.test(form.oss_bucket.trim())
    ? tr("oss.errBucket") : undefined;
  const publicBase = form.oss_public_base.trim();
  let publicBaseError: string | undefined;
  if (publicBase) {
    try {
      const url = new URL(publicBase);
      if (!["https:", "http:"].includes(url.protocol) || url.search || url.hash) {
        publicBaseError = tr("oss.errPublicUrl");
      }
    } catch { publicBaseError = tr("oss.errPublicUrlFull"); }
  }
  const hasId = !clearOssId && (form.has_oss_access_key_id || Boolean(ossKeyIdInput.trim()));
  const hasSecret = !clearOssSecret && (form.has_oss_access_key_secret || Boolean(ossKeySecretInput.trim()));
  const ossReady = form.oss_enabled && Boolean(endpoint && !endpointError && form.oss_bucket.trim() && !bucketError && hasId && hasSecret);
  const publicEndpoint = endpoint.replace("-internal.aliyuncs.com", ".aliyuncs.com").replace("-internal-accelerate.aliyuncs.com", ".aliyuncs.com");
  const generatedBase = form.oss_bucket.trim() && endpoint && !endpointError && !bucketError ? `https://${form.oss_bucket.trim()}.${publicEndpoint}` : "";
  const accessPreview = publicBase || generatedBase;
  const folder = form.oss_folder.trim().replace(/^\/+|\/+$/g, "") || "kepu";

  return <SettingsTabShell onSave={handleSave} saving={saving} saveLabel={tr("oss.saveLabel")}>
    <SettingsStatusBar title={tr("oss.statusTitle")} items={[
      { id: "oss", label: tr("oss.alibabaOss"), ready: ossReady, readyText: tr("oss.fullyConfigured"), pendingText: form.oss_enabled ? tr("oss.needConnection") : tr("oss.notEnabled") },
      { id: "public", label: tr("oss.publicAccess"), ready: Boolean(accessPreview && !publicBaseError), readyText: publicBase ? tr("oss.customUrl") : tr("oss.bucketDefaultUrl"), pendingText: tr("oss.pendingConfig") },
      { id: "async", label: tr("oss.uploadMode"), ready: form.oss_enabled && form.oss_upload_async, readyText: tr("oss.asyncUpload"), pendingText: form.oss_enabled ? tr("oss.syncUpload") : tr("oss.needsOss") },
    ]} extra={<span className="settings-status-extra">{tr("oss.configSource", { source: form.source === "db" ? tr("oss.sourceAdmin") : tr("oss.sourceEnv") })}</span>} />

    <SettingsPanel title={tr("oss.connectionTitle")} description={tr("oss.connectionDesc")}>
      <div className="settings-toggle-row">
        <div><strong>{tr("oss.enableOss")}</strong><span>{tr("oss.enableOssHint")}</span></div>
        <Switch aria-label={tr("oss.enableOss")} checked={form.oss_enabled} onCheckedChange={(value) => patchField("oss_enabled", value)} />
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        {tr("oss.marketplaceNote")}
      </p>
      <div className="settings-field-grid mt-5">
        <LabeledControl label={tr("oss.endpoint")} required={form.oss_enabled} error={endpointError} hint={tr("oss.endpointHint")}>
          <input className="settings-input" placeholder="oss-cn-beijing.aliyuncs.com" value={form.oss_endpoint} onChange={(event) => patchField("oss_endpoint", event.target.value)} autoCapitalize="none" spellCheck={false} />
        </LabeledControl>
        <LabeledControl label={tr("oss.bucket")} required={form.oss_enabled} error={bucketError} hint={tr("oss.bucketHint")}>
          <input className="settings-input" placeholder="printfilm-media" value={form.oss_bucket} onChange={(event) => patchField("oss_bucket", event.target.value)} autoCapitalize="none" spellCheck={false} maxLength={63} />
        </LabeledControl>
        <LabeledControl label={tr("oss.region")} optional hint={tr("oss.regionHint")}>
          <input className="settings-input" placeholder="cn-beijing" value={form.oss_region} onChange={(event) => patchField("oss_region", event.target.value)} autoCapitalize="none" spellCheck={false} />
        </LabeledControl>
        <LabeledControl label={tr("oss.prefix")} optional hint={tr("oss.prefixHint")}>
          <input className="settings-input" placeholder="kepu" value={form.oss_folder} onChange={(event) => patchField("oss_folder", event.target.value)} spellCheck={false} />
        </LabeledControl>
      </div>
    </SettingsPanel>

    <SettingsPanel title={tr("oss.credentialsTitle")} description={tr("oss.credentialsDesc")}>
      <div className="settings-field-grid">
        <SecretField label="AccessKey ID" placeholder={tr("oss.enterKeyId")} value={ossKeyIdInput} configured={form.has_oss_access_key_id} required={form.oss_enabled}
          clearPending={clearOssId} onUndoClear={() => setClearOssId(false)}
          error={form.oss_enabled && clearOssId ? tr("oss.clearBlocked") : undefined}
          onChange={(value) => { setOssKeyIdInput(value); setClearOssId(false); }} onClear={() => setClearOssId(true)} />
        <SecretField label="AccessKey Secret" placeholder={tr("oss.enterKeySecret")} value={ossKeySecretInput} configured={form.has_oss_access_key_secret} required={form.oss_enabled}
          clearPending={clearOssSecret} onUndoClear={() => setClearOssSecret(false)}
          error={form.oss_enabled && clearOssSecret ? tr("oss.clearBlocked") : undefined}
          onChange={(value) => { setOssKeySecretInput(value); setClearOssSecret(false); }} onClear={() => setClearOssSecret(true)} />
      </div>
    </SettingsPanel>

    <SettingsPanel title={tr("oss.publicTitle")} description={tr("oss.publicDesc")}>
      <LabeledControl label={tr("oss.customAccessUrl")} optional error={publicBaseError} hint={tr("oss.customAccessUrlHint")}>
        <input className="settings-input" type="url" placeholder="https://cdn.example.com" value={form.oss_public_base} onChange={(event) => patchField("oss_public_base", event.target.value)} autoCapitalize="none" spellCheck={false} />
      </LabeledControl>
      <div className="admin-form-preview mt-4" aria-live="polite">
        <strong>{tr("oss.previewTitle")}</strong>
        <div className="mt-1 break-all font-mono">{accessPreview && !publicBaseError ? `${accessPreview.replace(/\/$/, "")}/${folder}/generated/…` : tr("oss.previewEmpty")}</div>
      </div>
    </SettingsPanel>

    <details className="settings-advanced">
      <summary>{tr("oss.advancedTitle")}</summary>
      <div>
        <div className="settings-toggle-row">
          <div><strong>{tr("oss.asyncUpload")}</strong><span>{form.oss_enabled ? tr("oss.asyncHint") : tr("oss.asyncNeedsOss")}</span></div>
          <Switch aria-label={tr("oss.enableAsync")} checked={form.oss_upload_async} disabled={!form.oss_enabled} onCheckedChange={(value) => patchField("oss_upload_async", value)} />
        </div>
        <div className="settings-field-grid mt-5">
          <LabeledControl label={tr("oss.queueName")} required={form.oss_enabled && form.oss_upload_async} hint={tr("oss.queueNameHint")}>
            <input className="settings-input" placeholder={tr("oss.queueNamePlaceholder")} value={form.oss_upload_queue} disabled={!form.oss_enabled || !form.oss_upload_async} onChange={(event) => patchField("oss_upload_queue", event.target.value)} spellCheck={false} />
          </LabeledControl>
        </div>
      </div>
    </details>
  </SettingsTabShell>;
}
