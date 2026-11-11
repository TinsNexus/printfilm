import { useState, type ChangeEvent } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { LabeledControl, SettingsLoading, SettingsPanel, SettingsStatusBar, SettingsTabShell } from "@/components/settings/SettingsPanel";
import { SecretField } from "@/components/settings/SecretField";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useAdminModelSettings } from "@/hooks/useAdminModelSettings";
import { stripeRateInputError, stripeSettingsPatch, stripeSettingsReady } from "@/lib/stripeSettings";
import { MediaPriceSettings } from "./MediaPriceSettings";
import { AppleProductSettings } from "./AppleProductSettings";
import { AppleConnectionSettings } from "./AppleConnectionSettings";
import { WalletMigrationSettings } from "./WalletMigrationSettings";
import { tr } from "@/i18n";

// 只存文案 key（模块级常量不能存已翻译文字），渲染时 tr()
const RATE_FIELDS = [
  { key: "billing_llm_per_m", labelKey: "paymentSettings.rate.llm", unitKey: "paymentSettings.unit.yuanPerMTokens" },
  { key: "billing_tts_per_m", labelKey: "paymentSettings.rate.tts", unitKey: "paymentSettings.unit.yuanPerMTokens" },
  { key: "billing_seedream_per_m", labelKey: "paymentSettings.rate.seedreamLegacy", unitKey: "paymentSettings.unit.yuanPerMTokens" },
  { key: "billing_seedance_video0", labelKey: "paymentSettings.rate.seedanceVideo0Legacy", unitKey: "paymentSettings.unit.yuanPerMTokens" },
  { key: "billing_seedance_video1", labelKey: "paymentSettings.rate.seedanceVideo1Legacy", unitKey: "paymentSettings.unit.yuanPerMTokens" },
  { key: "billing_kie_fen_per_credit", labelKey: "paymentSettings.rate.kieCredit", unitKey: "paymentSettings.unit.fenPerCredit" },
] as const;
const ESTIMATE_FIELDS = [
  { key: "billing_est_llm_tokens", labelKey: "paymentSettings.rate.llm", unitKey: "paymentSettings.unit.tokensPerCall" },
  { key: "billing_est_seedream_tokens", labelKey: "paymentSettings.rate.seedream", unitKey: "paymentSettings.unit.tokensPerCall" },
  { key: "billing_est_tts_tokens", labelKey: "paymentSettings.rate.tts", unitKey: "paymentSettings.unit.tokensPerCall" },
  { key: "billing_est_seedance_tokens_per_sec", labelKey: "paymentSettings.rate.seedanceVideo", unitKey: "paymentSettings.unit.tokensPerSecond" },
] as const;
type NumericKey = typeof RATE_FIELDS[number]["key"] | typeof ESTIMATE_FIELDS[number]["key"]
  | "billing_estimate_buffer" | "billing_signup_grant_fen" | "billing_user_alert_interval_fen"
  | "smtp_port";

export function PaymentSettingsPanel() {
  const { form, loading, saving, patchField, save } = useAdminModelSettings();
  const [epayKeyInput, setEpayKeyInput] = useState("");
  const [clearEpayKey, setClearEpayKey] = useState(false);
  const [stripeKeyInput, setStripeKeyInput] = useState("");
  const [clearStripeKey, setClearStripeKey] = useState(false);
  const [stripeWebhookInput, setStripeWebhookInput] = useState("");
  const [clearStripeWebhook, setClearStripeWebhook] = useState(false);
  const [smtpPasswordInput, setSmtpPasswordInput] = useState("");
  const [clearSmtpPassword, setClearSmtpPassword] = useState(false);
  const [numericDrafts, setNumericDrafts] = useState<Partial<Record<NumericKey, string>>>({});
  const stripeDrafts = {
    secretKey: stripeKeyInput,
    webhookSecret: stripeWebhookInput,
    clearSecretKey: clearStripeKey,
    clearWebhookSecret: clearStripeWebhook,
  };

  function numericControl(key: NumericKey) {
    return {
      value: numericDrafts[key] ?? String(form?.[key] ?? ""),
      onChange: (event: ChangeEvent<HTMLInputElement>) => {
        const raw = event.target.value;
        setNumericDrafts((previous) => ({ ...previous, [key]: raw }));
        if (raw.trim() && Number.isFinite(Number(raw))) patchField(key, Number(raw));
      },
    };
  }

  async function copyStripeWebhook() {
    try {
      await navigator.clipboard.writeText(form?.stripe_webhook_url || "/api/billing/stripe/webhook");
      toast.success(tr("paymentSettings.webhookCopied"));
    } catch {
      toast.error(tr("paymentSettings.webhookCopyFailed"));
    }
  }

  async function handleSave() {
    if (!form) return;
    const saved = await save({
      ...stripeSettingsPatch(form, stripeDrafts),
      epay_api_url: form.epay_api_url.trim(),
      epay_pid: form.epay_pid.trim(),
      epay_key: clearEpayKey ? undefined : epayKeyInput.trim() || undefined,
      clear_epay_key: clearEpayKey,
      epay_notify_url: form.epay_notify_url.trim(),
      epay_return_url: form.epay_return_url.trim(),
      billing_enabled: form.billing_enabled,
      unified_wallet_enabled: form.unified_wallet_enabled,
      wallet_environment: form.wallet_environment,
      billing_markup: 1.0,
      billing_estimate_buffer: form.billing_estimate_buffer,
      billing_seedance_video0: form.billing_seedance_video0,
      billing_seedance_video1: form.billing_seedance_video1,
      billing_llm_per_m: form.billing_llm_per_m,
      billing_seedream_per_m: form.billing_seedream_per_m,
      billing_tts_per_m: form.billing_tts_per_m,
      billing_kie_fen_per_credit: form.billing_kie_fen_per_credit,
      billing_est_llm_tokens: form.billing_est_llm_tokens,
      billing_est_seedream_tokens: form.billing_est_seedream_tokens,
      billing_est_tts_tokens: form.billing_est_tts_tokens,
      billing_est_seedance_tokens_per_sec: form.billing_est_seedance_tokens_per_sec,
      billing_signup_grant_fen: form.billing_signup_grant_fen,
      billing_user_alert_enabled: form.billing_user_alert_enabled,
      billing_user_alert_interval_fen: form.billing_user_alert_interval_fen,
      smtp_enabled: form.smtp_enabled,
      smtp_host: form.smtp_host.trim(),
      smtp_port: form.smtp_port,
      smtp_user: form.smtp_user.trim(),
      smtp_password: clearSmtpPassword ? undefined : smtpPasswordInput.trim() || undefined,
      clear_smtp_password: clearSmtpPassword,
      smtp_from: form.smtp_from.trim(),
      smtp_use_tls: form.smtp_use_tls,
    }, tr("paymentSettings.saved"));
    if (!saved) return;
    setEpayKeyInput("");
    setClearEpayKey(false);
    setStripeKeyInput("");
    setClearStripeKey(false);
    setStripeWebhookInput("");
    setClearStripeWebhook(false);
    setSmtpPasswordInput("");
    setClearSmtpPassword(false);
    setNumericDrafts({});
  }

  if (loading || !form) return <SettingsLoading />;

  const hasEpayKey = !clearEpayKey && (form.has_epay_key || Boolean(epayKeyInput.trim()));
  const epayInUse = Boolean(form.epay_pid.trim() || hasEpayKey);
  const epayReady = Boolean(form.epay_api_url.trim() && form.epay_pid.trim() && hasEpayKey);
  const stripeReady = stripeSettingsReady(form, stripeDrafts);
  const usdRateError = stripeRateInputError(form.stripe_usd_cny_rate);
  const hasSmtpPassword = !clearSmtpPassword && (form.has_smtp_password || Boolean(smtpPasswordInput.trim()));
  const smtpNeedsPassword = form.smtp_enabled && Boolean(form.smtp_user.trim());
  const smtpReady = form.smtp_enabled && Boolean(form.smtp_host.trim() && form.smtp_from.trim() && (!smtpNeedsPassword || hasSmtpPassword));
  const moneyHint = (key: NumericKey) => {
    const raw = numericDrafts[key] ?? form[key];
    return raw === "" ? tr("paymentSettings.pointsIntegerRequired") : tr("paymentSettings.pointsHint", { n: Number(raw).toLocaleString() });
  };

  return <div className="space-y-5">
    <SettingsTabShell onSave={handleSave} saving={saving} disabled={Boolean(usdRateError)} saveLabel={tr("paymentSettings.saveLabel")}>
      <SettingsStatusBar title={tr("paymentSettings.statusTitle")} items={[
        { id: "epay", label: "Epay", ready: epayReady, readyText: tr("paymentSettings.fullyConfigured"), pendingText: tr("paymentSettings.notConnected") },
        { id: "stripe", label: "Stripe", ready: stripeReady, readyText: tr("paymentSettings.fullyConfigured"), pendingText: form.stripe_enabled ? tr("paymentSettings.stripeIncomplete") : tr("paymentSettings.notEnabled") },
        { id: "billing", label: tr("paymentSettings.balanceBilling"), ready: form.billing_enabled, readyText: tr("paymentSettings.on"), pendingText: tr("paymentSettings.off") },
        { id: "smtp", label: tr("paymentSettings.email"), ready: smtpReady, readyText: tr("paymentSettings.fullyConfigured"), pendingText: form.smtp_enabled ? tr("paymentSettings.smtpIncomplete") : tr("paymentSettings.notEnabled") },
      ]} />

      <SettingsPanel title={tr("paymentSettings.epayTitle")} description={tr("paymentSettings.epayDesc")}>
        <div className="settings-field-grid">
          <LabeledControl label={tr("paymentSettings.gatewayUrl")} required={epayInUse} hint={tr("paymentSettings.gatewayUrlHint")}>
            <input className="settings-input" type="url" placeholder="https://pay.example.com" value={form.epay_api_url} onChange={(event) => patchField("epay_api_url", event.target.value)} autoCapitalize="none" spellCheck={false} />
          </LabeledControl>
          <LabeledControl label={tr("paymentSettings.merchantPid")} required={epayInUse} hint={tr("paymentSettings.merchantPidHint")}>
            <input className="settings-input" placeholder={tr("paymentSettings.merchantPidPlaceholder")} value={form.epay_pid} onChange={(event) => patchField("epay_pid", event.target.value)} autoCapitalize="none" spellCheck={false} />
          </LabeledControl>
          <SecretField label={tr("paymentSettings.merchantKey")} value={epayKeyInput} configured={form.has_epay_key} required={epayInUse}
            clearPending={clearEpayKey} onUndoClear={() => setClearEpayKey(false)}
            onChange={(value) => { setEpayKeyInput(value); setClearEpayKey(false); }} onClear={() => setClearEpayKey(true)} />
        </div>
        <details className="settings-advanced mt-5">
          <summary>{tr("paymentSettings.epayAdvanced")}</summary>
          <div className="settings-field-grid">
            <LabeledControl label={tr("paymentSettings.notifyUrl")} optional hint={tr("paymentSettings.notifyUrlHint")}>
              <input className="settings-input" type="url" placeholder="https://www.example.com/epay/notify" value={form.epay_notify_url} onChange={(event) => patchField("epay_notify_url", event.target.value)} autoCapitalize="none" spellCheck={false} />
            </LabeledControl>
            <LabeledControl label={tr("paymentSettings.returnUrl")} optional hint={tr("paymentSettings.returnUrlHint")}>
              <input className="settings-input" type="url" placeholder="https://www.example.com/settings" value={form.epay_return_url} onChange={(event) => patchField("epay_return_url", event.target.value)} autoCapitalize="none" spellCheck={false} />
            </LabeledControl>
          </div>
        </details>
      </SettingsPanel>

      <SettingsPanel title={tr("paymentSettings.stripeTitle")} description={tr("paymentSettings.stripeDesc")}>
        <div className="settings-toggle-row">
          <div><strong>{tr("paymentSettings.stripeEnable")}</strong><span>{tr("paymentSettings.stripeEnableHint")}</span></div>
          <Switch aria-label={tr("paymentSettings.stripeEnable")} checked={Boolean(form.stripe_enabled)} onCheckedChange={(value) => patchField("stripe_enabled", value)} />
        </div>

        <div className="settings-field-grid mt-5">
          <LabeledControl label={tr("paymentSettings.stripeCurrency")} hint={tr("paymentSettings.stripeCurrencyHint")}>
            <input className="settings-input" readOnly value={tr("paymentSettings.stripeCurrencyAuto")} />
          </LabeledControl>
          <LabeledControl label={tr("paymentSettings.usdRate")} optional error={usdRateError}
            hint={tr("paymentSettings.usdRateHint")}>
            <input className="settings-input" type="text" inputMode="decimal" placeholder={tr("paymentSettings.usdRatePlaceholder")} value={form.stripe_usd_cny_rate || ""}
              onChange={(event) => patchField("stripe_usd_cny_rate", event.target.value)} autoComplete="off" spellCheck={false} />
          </LabeledControl>
          <SecretField label={tr("paymentSettings.stripeSecret")} value={stripeKeyInput} configured={Boolean(form.has_stripe_secret_key)} required={form.stripe_enabled}
            placeholder={tr("paymentSettings.stripeSecretPlaceholder")} hint={tr("paymentSettings.stripeSecretHint")}
            clearPending={clearStripeKey} onUndoClear={() => setClearStripeKey(false)}
            onChange={(value) => { setStripeKeyInput(value); setClearStripeKey(false); }} onClear={() => setClearStripeKey(true)} />
          <SecretField label={tr("paymentSettings.stripeWebhookSecret")} value={stripeWebhookInput} configured={Boolean(form.has_stripe_webhook_secret)} required={form.stripe_enabled}
            placeholder="whsec_…" hint={tr("paymentSettings.stripeWebhookSecretHint")}
            clearPending={clearStripeWebhook} onUndoClear={() => setClearStripeWebhook(false)}
            onChange={(value) => { setStripeWebhookInput(value); setClearStripeWebhook(false); }} onClear={() => setClearStripeWebhook(true)} />
          <LabeledControl label={tr("paymentSettings.stripeReturnSite")} optional hint={tr("paymentSettings.stripeReturnSiteHint")}>
            <input className="settings-input" type="url" placeholder="https://app.example.com" value={form.stripe_frontend_url || ""} onChange={(event) => patchField("stripe_frontend_url", event.target.value)} autoCapitalize="none" spellCheck={false} />
          </LabeledControl>
          <LabeledControl label={tr("paymentSettings.stripeWebhookUrl")} hint={tr("paymentSettings.stripeWebhookUrlHint")}>
            <div className="flex items-center gap-2">
              <input className="settings-input min-w-0" readOnly value={form.stripe_webhook_url || "/api/billing/stripe/webhook"} />
              <Button type="button" variant="outline" aria-label={tr("paymentSettings.copyWebhookUrl")} onClick={() => void copyStripeWebhook()}><Copy size={14} />{tr("paymentSettings.copy")}</Button>
            </div>
          </LabeledControl>
        </div>
        <p className="settings-panel-footnote">{tr("paymentSettings.usdRateNote")}</p>
        <p className="settings-panel-footnote">{tr("paymentSettings.webhookEventsNote")}</p>
      </SettingsPanel>

      <SettingsPanel title={tr("paymentSettings.billingTitle")} description={tr("paymentSettings.billingDesc")}>
        <div className="settings-toggle-row">
          <div><strong>{tr("paymentSettings.enableBalanceBilling")}</strong><span>{tr("paymentSettings.enableBalanceBillingHint")}</span></div>
          <Switch aria-label={tr("paymentSettings.enableBalanceBilling")} checked={form.billing_enabled} onCheckedChange={(value) => patchField("billing_enabled", value)} />
          <label>{tr("paymentSettings.enableWalletVerifyFirst")}<Switch aria-label={tr("paymentSettings.enableWallet")} checked={form.unified_wallet_enabled} onCheckedChange={(value) => patchField("unified_wallet_enabled", value)} /></label>
        </div>
        <p className="settings-panel-footnote">{tr("paymentSettings.enableWalletHint")}</p>
        <LabeledControl label={tr("paymentSettings.walletEnv")} hint={tr("paymentSettings.walletEnvHint")}>
          <select className="settings-input" value={form.wallet_environment} onChange={event => patchField("wallet_environment", event.target.value as "Production" | "Sandbox")}><option value="Production">{tr("paymentSettings.walletEnvProduction")}</option><option value="Sandbox">{tr("paymentSettings.walletEnvSandbox")}</option></select>
        </LabeledControl>
        <div className="settings-field-grid mt-5">
          <LabeledControl label={tr("paymentSettings.signupBonusPoints")} required hint={moneyHint("billing_signup_grant_fen")}>
            <input className="settings-input" type="number" min={0} step={1} placeholder="0" {...numericControl("billing_signup_grant_fen")} />
          </LabeledControl>
        </div>
        <details className="settings-advanced mt-5">
          <summary>{tr("paymentSettings.billingAdvanced")}</summary>
          <div>
            <p className="settings-runtime-note">{tr("paymentSettings.billingAdvancedNote")}</p>
            <fieldset className="m-0 min-w-0 border-0 p-0" disabled={!form.billing_enabled}>
              <div className="settings-subsection-title">{tr("paymentSettings.tokenRatesTitle")}</div>
              <div className="settings-field-grid">
                {RATE_FIELDS.map((field) => <LabeledControl key={field.key} label={tr(field.labelKey)} required={form.billing_enabled} hint={tr(field.unitKey)}>
                  <input className="settings-input" type="number" min={0} step="any" {...numericControl(field.key)} />
                </LabeledControl>)}
              </div>
              <div className="settings-subsection-title">{tr("paymentSettings.estimatesTitle")}</div>
              <div className="settings-field-grid">
                <LabeledControl label={tr("paymentSettings.holdBuffer")} required={form.billing_enabled} hint={tr("paymentSettings.holdBufferHint")}>
                  <input className="settings-input" type="number" min={1} step="0.01" {...numericControl("billing_estimate_buffer")} />
                </LabeledControl>
                {ESTIMATE_FIELDS.map((field) => <LabeledControl key={field.key} label={tr("paymentSettings.defaultUsage", { label: tr(field.labelKey) })} required={form.billing_enabled} hint={tr("paymentSettings.defaultUsageHint", { unit: tr(field.unitKey) })}>
                  <input className="settings-input" type="number" min={1} step={1} {...numericControl(field.key)} />
                </LabeledControl>)}
              </div>
            </fieldset>
            {!form.billing_enabled && <p className="settings-panel-footnote">{tr("paymentSettings.billingOffNote")}</p>}
          </div>
        </details>
      </SettingsPanel>

      <SettingsPanel title={tr("paymentSettings.spendAlertTitle")} description={tr("paymentSettings.spendAlertDesc")}>
        <div className="settings-toggle-row">
          <div><strong>{tr("paymentSettings.spendAlertPopup")}</strong><span>{tr("paymentSettings.spendAlertPopupHint")}</span></div>
          <Switch aria-label={tr("paymentSettings.spendAlertPopup")} checked={form.billing_user_alert_enabled} disabled={!form.billing_enabled} onCheckedChange={(value) => patchField("billing_user_alert_enabled", value)} />
        </div>
        <div className="settings-field-grid mt-5">
          <LabeledControl label={tr("paymentSettings.spendAlertIntervalPoints")} required={form.billing_enabled && form.billing_user_alert_enabled} hint={form.billing_enabled ? moneyHint("billing_user_alert_interval_fen") : tr("paymentSettings.spendAlertNeedsBilling")}>
            <input className="settings-input" type="number" min={1} step={1} disabled={!form.billing_enabled || !form.billing_user_alert_enabled} {...numericControl("billing_user_alert_interval_fen")} />
          </LabeledControl>
        </div>
      </SettingsPanel>

      <details className="settings-advanced" open={form.smtp_enabled || undefined}>
        <summary>{tr("paymentSettings.smtpSummary")} · {form.smtp_enabled ? tr("paymentSettings.on") : tr("paymentSettings.smtpOffClickToConfigure")}</summary>
        <SettingsPanel title={tr("paymentSettings.email")} description={tr("paymentSettings.smtpDesc")}>
          <div className="settings-toggle-row">
            <div><strong>{tr("paymentSettings.smtpEnable")}</strong><span>{tr("paymentSettings.smtpEnableHint")}</span></div>
            <Switch aria-label={tr("paymentSettings.smtpEnable")} checked={form.smtp_enabled} onCheckedChange={(value) => patchField("smtp_enabled", value)} />
          </div>
          <div className="settings-field-grid mt-5">
            <LabeledControl label={tr("paymentSettings.smtpHost")} required={form.smtp_enabled} hint={tr("paymentSettings.smtpHostHint")}>
              <input className="settings-input" disabled={!form.smtp_enabled} placeholder="smtp.example.com" value={form.smtp_host} onChange={(event) => patchField("smtp_host", event.target.value)} autoCapitalize="none" spellCheck={false} pattern="[^/:\s]+" />
            </LabeledControl>
            <LabeledControl label={tr("paymentSettings.smtpPort")} required={form.smtp_enabled} hint={tr("paymentSettings.smtpPortHint")}>
              <input className="settings-input" type="number" disabled={!form.smtp_enabled} min={1} max={65535} step={1} placeholder="587" {...numericControl("smtp_port")} />
            </LabeledControl>
            <LabeledControl label={tr("paymentSettings.smtpFrom")} required={form.smtp_enabled} hint={tr("paymentSettings.smtpFromHint")}>
              <input className="settings-input" type="email" disabled={!form.smtp_enabled} placeholder="notice@example.com" value={form.smtp_from} onChange={(event) => patchField("smtp_from", event.target.value)} autoCapitalize="none" spellCheck={false} />
            </LabeledControl>
            <LabeledControl label={tr("paymentSettings.smtpUser")} optional hint={tr("paymentSettings.smtpUserHint")}>
              <input className="settings-input" disabled={!form.smtp_enabled} placeholder="notice@example.com" value={form.smtp_user} onChange={(event) => patchField("smtp_user", event.target.value)} autoCapitalize="none" spellCheck={false} />
            </LabeledControl>
            <SecretField label={tr("paymentSettings.smtpPassword")} value={smtpPasswordInput} configured={form.has_smtp_password} required={smtpNeedsPassword}
              clearPending={clearSmtpPassword} onUndoClear={() => setClearSmtpPassword(false)}
              hint={tr("paymentSettings.smtpPasswordHint")}
              error={smtpNeedsPassword && clearSmtpPassword ? tr("paymentSettings.smtpPasswordClearBlocked") : undefined}
              onChange={(value) => { setSmtpPasswordInput(value); setClearSmtpPassword(false); }} onClear={() => setClearSmtpPassword(true)} />
            <LabeledControl label={tr("paymentSettings.starttls")} hint={[465, 8465, 2465].includes(form.smtp_port) ? tr("paymentSettings.starttlsImplicitHint") : tr("paymentSettings.starttlsHint")}>
              <div className="settings-inline-switch">
                <Switch aria-label={tr("paymentSettings.starttlsEnable")} disabled={!form.smtp_enabled || [465, 8465, 2465].includes(form.smtp_port)} checked={form.smtp_use_tls} onCheckedChange={(value) => patchField("smtp_use_tls", value)} />
              </div>
            </LabeledControl>
          </div>
        </SettingsPanel>
      </details>
    </SettingsTabShell>
    <WalletMigrationSettings />
    <AppleConnectionSettings />
    <AppleProductSettings />
    <MediaPriceSettings />
  </div>;
}
