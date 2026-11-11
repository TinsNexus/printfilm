import { useEffect, useState } from 'react';
import { api } from '@/api/client';
import { useAdminModelSettings } from '@/hooks/useAdminModelSettings';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { LabeledControl, SettingsPanel } from './SettingsPanel';
import { tr, tRich } from "@/i18n";

type Status = { configured: boolean; missing: string[]; environment: string; notification_url: string;
  notification_https: boolean; unified_wallet_enabled: boolean; wallet_environment: string; wallet_environment_matches: boolean; runtime_running: boolean };

export function AppleConnectionSettings() {
  const { form, loading, saving, patchField, save } = useAdminModelSettings();
  const [privateKey, setPrivateKey] = useState('');
  const [keyName, setKeyName] = useState('');
  const [clearKey, setClearKey] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  async function check() {
    setChecking(true); setError('');
    try { setStatus(await api<Status>('/api/admin/settings/apple/status')); }
    catch (cause) { setError((cause as Error).message); }
    finally { setChecking(false); }
  }
  useEffect(() => { void check(); }, []);

  async function upload(files: FileList | null, key: boolean) {
    if (!files?.length) return;
    setError('');
    try {
      const selected = Array.from(files);
      if (selected.reduce((sum, file) => sum + file.size, 0) > (key ? 16384 : 45000)) throw new Error(tr("appleSettings.fileTooLarge"));
      if (key) {
        setPrivateKey(await selected[0].text()); setKeyName(selected[0].name); setClearKey(false);
      } else {
        const certificates = await Promise.all(selected.map(async file => {
          const data = new Uint8Array(await file.arrayBuffer());
          const text = new TextDecoder().decode(data);
          if (text.includes('-----BEGIN CERTIFICATE-----')) return text.trim();
          const base64 = btoa(String.fromCharCode(...data));
          return '-----BEGIN CERTIFICATE-----\n' + base64.match(/.{1,64}/g)?.join('\n') + '\n-----END CERTIFICATE-----';
        }));
        patchField('apple_root_certificates', certificates.join('\n'));
      }
    } catch (cause) { setError((cause as Error).message); }
  }

  async function submit() {
    if (!form) return;
    const saved = await save({
      apple_sandbox_enabled: form.apple_sandbox_enabled, apple_sandbox_user_ids: form.apple_sandbox_user_ids,
      apple_iap_enabled: form.apple_iap_enabled, apple_environment: form.apple_environment, apple_bundle_id: form.apple_bundle_id.trim(),
      apple_app_id: form.apple_app_id, apple_issuer_id: form.apple_issuer_id.trim(), apple_key_id: form.apple_key_id.trim(),
      apple_private_key: privateKey || undefined, clear_apple_private_key: clearKey,
      apple_root_certificates: form.apple_root_certificates,
    }, tr("appleSettings.saved"));
    if (saved) { setPrivateKey(''); setKeyName(''); setClearKey(false); await check(); }
  }
  return <SettingsPanel title={tr("appleSettings.title")} description={tr("appleSettings.desc")}>
    {loading || !form ? <p role="status">{tr("appleSettings.loading")}</p> : <div className="space-y-5">
      <div className="settings-toggle-row"><div><strong>{tr("appleSettings.allowPurchases")}</strong><span>{tr("appleSettings.allowPurchasesHint")}</span></div>
        <Switch aria-label={tr("appleSettings.allowPurchases")} checked={form.apple_iap_enabled} onCheckedChange={value => patchField('apple_iap_enabled', value)} /></div>
      <div className="settings-toggle-row"><div><strong>{tr("appleSettings.allowSandbox")}</strong><span>{tr("appleSettings.allowSandboxHint")}</span></div>
        <Switch aria-label={tr("appleSettings.allowSandboxAria")} checked={form.apple_sandbox_enabled} onCheckedChange={value => patchField('apple_sandbox_enabled', value)} /></div>
      <LabeledControl label={tr("appleSettings.sandboxUsers")} hint={tr("appleSettings.sandboxUsersHint")}>
        <input className="settings-input" value={form.apple_sandbox_user_ids} onChange={e => patchField('apple_sandbox_user_ids', e.target.value.replace(/\s/g, ''))} />
      </LabeledControl>
      <div className="settings-field-grid">
        <LabeledControl label={tr("appleSettings.environment")} hint={tr("appleSettings.environmentHint")}><select className="settings-input" value={form.apple_environment} onChange={e => patchField('apple_environment', e.target.value as 'Production' | 'Sandbox')}><option value="Production">{tr("appleSettings.envProduction")}</option><option value="Sandbox">{tr("appleSettings.envSandbox")}</option></select></LabeledControl>
        <LabeledControl label="Bundle ID"><input className="settings-input" value={form.apple_bundle_id} onChange={e => patchField('apple_bundle_id', e.target.value)} placeholder="com.deep.printfilm" /></LabeledControl>
        <LabeledControl label="Apple App ID" hint={tr("appleSettings.appIdHint")}><input className="settings-input" type="number" min="0" step="1" value={form.apple_app_id || ''} onChange={e => patchField('apple_app_id', Number(e.target.value))} /></LabeledControl>
        <LabeledControl label="Issuer ID"><input className="settings-input" value={form.apple_issuer_id} onChange={e => patchField('apple_issuer_id', e.target.value)} /></LabeledControl>
        <LabeledControl label="Key ID"><input className="settings-input" value={form.apple_key_id} onChange={e => patchField('apple_key_id', e.target.value)} /></LabeledControl>
        <LabeledControl label={tr("appleSettings.privateKey")} hint={clearKey ? tr("appleSettings.keyClearPending") : keyName ? tr("appleSettings.keySelected") : form.has_apple_private_key ? tr("appleSettings.keyConfigured") : tr("appleSettings.keyMissing")}>
          <input className="settings-input" type="file" accept=".p8,.pem" onChange={e => { void upload(e.target.files, true); e.target.value = ''; }} />
          <Button type="button" variant="outline" onClick={() => { setClearKey(!clearKey); setPrivateKey(''); setKeyName(''); }}>{clearKey ? tr("appleSettings.undoClear") : tr("appleSettings.clearKey")}</Button>
        </LabeledControl>
        <LabeledControl label={tr("appleSettings.rootCerts")} hint={tr("appleSettings.rootCertsHint")}>
          <input className="settings-input" type="file" multiple accept=".cer,.der,.pem" onChange={e => { void upload(e.target.files, false); e.target.value = ''; }} />
          <p className="text-sm text-muted-foreground">{form.apple_root_certificates ? tr("appleSettings.rootCertsLoaded") : tr("appleSettings.rootCertsMissing")}</p>
        </LabeledControl>
      </div>
      <p className="text-sm">{tRich(tr("appleSettings.rootSourceNote"), { link: <a href="https://www.apple.com/certificateauthority/" target="_blank" rel="noopener noreferrer" className="underline">Apple PKI</a> })}</p>
      {status && <div className="rounded-lg border p-4 space-y-2 text-sm">
        <p>{tr("appleSettings.savedConfig", { status: status.configured ? tr("appleSettings.configuredNeedsTesting") : tr("appleSettings.missing", { items: status.missing.join(tr("appleSettings.listSep")) }) })}</p>
        <p>{tr("appleSettings.walletRuntime", { wallet: tr(status.unified_wallet_enabled ? "appleSettings.on" : "appleSettings.off"), runtime: tr(status.runtime_running ? "appleSettings.running" : "appleSettings.notRunning") })}</p>
        <p>{tr("appleSettings.walletEnv", { env: status.wallet_environment })}{!status.wallet_environment_matches && tr("appleSettings.envMismatch")}</p>
        <p className="break-all">{tr("appleSettings.notifyUrl", { url: status.notification_url })}</p>
        {!status.notification_https && <p className="text-destructive">{tr("appleSettings.needHttpsBase")}</p>}
        <Button type="button" variant="outline" onClick={() => { void navigator.clipboard.writeText(status.notification_url).catch(() => setError(tr("appleSettings.copyFailed"))); }}>{tr("appleSettings.copyNotifyUrl")}</Button>
      </div>}
      <div className="flex flex-wrap gap-2"><Button type="button" disabled={saving} onClick={() => void submit()}>{saving ? tr("appleSettings.saving") : tr("appleSettings.save")}</Button>
        <Button type="button" variant="outline" disabled={checking || saving} onClick={() => void check()}>{checking ? tr("appleSettings.checking") : tr("appleSettings.check")}</Button></div>
    </div>}
    {error && <p role="alert" className="text-destructive text-sm mt-4">{error}</p>}
  </SettingsPanel>;
}
