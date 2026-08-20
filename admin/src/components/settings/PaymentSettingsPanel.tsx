import { useMemo, useState } from "react";
import { CreditCard, Loader2, Save, Wallet } from "lucide-react";
import { LabeledControl, SectionTitle, SettingsPanel, SettingsSurface } from "@/components/settings/SettingsPanel";
import { SecretField } from "@/components/settings/SecretField";
import { Switch } from "@/components/ui/switch";
import { useAdminModelSettings } from "@/hooks/useAdminModelSettings";
import { cn } from "@/lib/utils";

// 易支付与 Token 计费配置
export function PaymentSettingsPanel() {
  const { form, loading, saving, patchField, save } = useAdminModelSettings();
  const [epayKeyInput, setEpayKeyInput] = useState("");
  const [clearEpayKey, setClearEpayKey] = useState(false);

  const epayReady = useMemo(() => {
    if (!form) return false;
    const hasKey = (form.has_epay_key && !clearEpayKey) || epayKeyInput.trim().length > 0;
    return Boolean(form.epay_pid && form.epay_api_url && hasKey);
  }, [form, clearEpayKey, epayKeyInput]);

  async function handleSave() {
    if (!form) return;
    await save(
      {
        epay_api_url: form.epay_api_url,
        epay_pid: form.epay_pid,
        epay_key: epayKeyInput.trim() || undefined,
        clear_epay_key: clearEpayKey,
        epay_notify_url: form.epay_notify_url,
        epay_return_url: form.epay_return_url,
        billing_enabled: form.billing_enabled,
        billing_markup: form.billing_markup,
        billing_estimate_buffer: form.billing_estimate_buffer,
        billing_seedance_video0: form.billing_seedance_video0,
        billing_seedance_video1: form.billing_seedance_video1,
        billing_llm_per_m: form.billing_llm_per_m,
        billing_seedream_per_m: form.billing_seedream_per_m,
        billing_tts_per_m: form.billing_tts_per_m,
        billing_est_llm_tokens: form.billing_est_llm_tokens,
        billing_est_seedream_tokens: form.billing_est_seedream_tokens,
        billing_est_tts_tokens: form.billing_est_tts_tokens,
        billing_est_seedance_tokens_per_sec: form.billing_est_seedance_tokens_per_sec,
        billing_signup_grant_fen: form.billing_signup_grant_fen,
        quota_enabled: form.quota_enabled,
        new_user_quota: form.new_user_quota,
      },
      "支付与计费已保存",
    );
    setEpayKeyInput("");
    setClearEpayKey(false);
  }

  if (loading || !form) {
    return (
      <div className="admin-panel flex items-center justify-center py-16 text-[#909399]">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        加载中…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-[#303133]">支付与计费</h2>
          <p className="mt-1 text-sm text-[#909399]">易支付充值、Token 扣费与注册赠送</p>
        </div>
        <button
          type="button"
          className="admin-quick-btn !inline-flex !w-auto items-center gap-2 px-4 py-2.5"
          disabled={saving}
          onClick={() => void handleSave()}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          保存
        </button>
      </div>

      <SettingsSurface>
        <SectionTitle icon={<CreditCard className="h-4 w-4" />} title="支付就绪" />
        <div className="mt-4 flex flex-wrap gap-3">
          <span className={cn("admin-status-pill", epayReady ? "is-done" : "is-warn")}>
            {epayReady ? "易支付已配置" : "易支付未完整配置"}
          </span>
          <span className={cn("admin-status-pill", form.billing_enabled ? "is-done" : "")}>
            {form.billing_enabled ? "Token 计费已开启" : "Token 计费已关闭"}
          </span>
        </div>
      </SettingsSurface>

      <SettingsPanel title="易支付 Epay" description="生产环境回调请用 /epay/notify，勿含 /api/ 前缀。">
        <SettingsSurface>
          <div className="settings-field-grid">
            <LabeledControl label="网关地址">
              <input
                className="settings-input"
                placeholder="https://pay.gitcc.com"
                value={form.epay_api_url}
                onChange={(e) => patchField("epay_api_url", e.target.value)}
              />
            </LabeledControl>
            <LabeledControl label="商户 PID">
              <input
                className="settings-input"
                value={form.epay_pid}
                onChange={(e) => patchField("epay_pid", e.target.value)}
              />
            </LabeledControl>
            <SecretField
              label="商户密钥"
              value={epayKeyInput}
              configured={form.has_epay_key && !clearEpayKey}
              onChange={setEpayKeyInput}
              onClear={() => {
                setEpayKeyInput("");
                setClearEpayKey(true);
              }}
            />
            <LabeledControl label="异步通知 URL" hint="生产：{域名}/epay/notify">
              <input
                className="settings-input"
                value={form.epay_notify_url}
                onChange={(e) => patchField("epay_notify_url", e.target.value)}
              />
            </LabeledControl>
            <LabeledControl label="同步跳转 URL">
              <input
                className="settings-input"
                value={form.epay_return_url}
                onChange={(e) => patchField("epay_return_url", e.target.value)}
              />
            </LabeledControl>
          </div>
        </SettingsSurface>
      </SettingsPanel>

      <SettingsPanel title="Token 计费" description="按上游成本 × markup 扣费；未返回 usage 时用估算 token。">
        <SettingsSurface>
          <SectionTitle icon={<Wallet className="h-4 w-4" />} title="开关与系数" />
          <div className="settings-toggle-row mt-4">
            <div>
              <strong>启用 Token 计费</strong>
              <span>关闭后生成不扣余额（管理员可单独豁免）</span>
            </div>
            <Switch checked={form.billing_enabled} onCheckedChange={(v) => patchField("billing_enabled", v)} />
          </div>
          <div className="settings-field-grid mt-4">
            <LabeledControl label="加价系数 markup">
              <input
                className="settings-input"
                type="number"
                step="0.1"
                min={1}
                value={form.billing_markup}
                onChange={(e) => patchField("billing_markup", Number(e.target.value))}
              />
            </LabeledControl>
            <LabeledControl label="预估缓冲系数">
              <input
                className="settings-input"
                type="number"
                step="0.1"
                min={1}
                value={form.billing_estimate_buffer}
                onChange={(e) => patchField("billing_estimate_buffer", Number(e.target.value))}
              />
            </LabeledControl>
            <LabeledControl label="注册赠送（分）">
              <input
                className="settings-input"
                type="number"
                min={0}
                value={form.billing_signup_grant_fen}
                onChange={(e) => patchField("billing_signup_grant_fen", Number(e.target.value))}
              />
            </LabeledControl>
          </div>

          <SectionTitle icon={<Wallet className="h-4 w-4" />} title="单价（元 / 百万 token）" />
          <div className="settings-field-grid mt-4">
            <LabeledControl label="LLM">
              <input
                className="settings-input"
                type="number"
                step="0.1"
                value={form.billing_llm_per_m}
                onChange={(e) => patchField("billing_llm_per_m", Number(e.target.value))}
              />
            </LabeledControl>
            <LabeledControl label="Seedream 生图">
              <input
                className="settings-input"
                type="number"
                step="0.1"
                value={form.billing_seedream_per_m}
                onChange={(e) => patchField("billing_seedream_per_m", Number(e.target.value))}
              />
            </LabeledControl>
            <LabeledControl label="TTS 语音">
              <input
                className="settings-input"
                type="number"
                step="0.1"
                value={form.billing_tts_per_m}
                onChange={(e) => patchField("billing_tts_per_m", Number(e.target.value))}
              />
            </LabeledControl>
            <LabeledControl label="Seedance video0">
              <input
                className="settings-input"
                type="number"
                step="0.1"
                value={form.billing_seedance_video0}
                onChange={(e) => patchField("billing_seedance_video0", Number(e.target.value))}
              />
            </LabeledControl>
            <LabeledControl label="Seedance video1">
              <input
                className="settings-input"
                type="number"
                step="0.1"
                value={form.billing_seedance_video1}
                onChange={(e) => patchField("billing_seedance_video1", Number(e.target.value))}
              />
            </LabeledControl>
          </div>

          <SectionTitle icon={<Wallet className="h-4 w-4" />} title="估算 token（缺 usage 时）" />
          <div className="settings-field-grid mt-4">
            <LabeledControl label="LLM 估算">
              <input
                className="settings-input"
                type="number"
                value={form.billing_est_llm_tokens}
                onChange={(e) => patchField("billing_est_llm_tokens", Number(e.target.value))}
              />
            </LabeledControl>
            <LabeledControl label="Seedream 估算">
              <input
                className="settings-input"
                type="number"
                value={form.billing_est_seedream_tokens}
                onChange={(e) => patchField("billing_est_seedream_tokens", Number(e.target.value))}
              />
            </LabeledControl>
            <LabeledControl label="TTS 估算">
              <input
                className="settings-input"
                type="number"
                value={form.billing_est_tts_tokens}
                onChange={(e) => patchField("billing_est_tts_tokens", Number(e.target.value))}
              />
            </LabeledControl>
            <LabeledControl label="Seedance token/秒">
              <input
                className="settings-input"
                type="number"
                value={form.billing_est_seedance_tokens_per_sec}
                onChange={(e) => patchField("billing_est_seedance_tokens_per_sec", Number(e.target.value))}
              />
            </LabeledControl>
          </div>

          <div className="settings-toggle-row mt-4">
            <div>
              <strong>旧版次数配额（quota_enabled）</strong>
              <span>与 Token 计费并存时以 billing_enabled 为准</span>
            </div>
            <Switch checked={form.quota_enabled} onCheckedChange={(v) => patchField("quota_enabled", v)} />
          </div>
          <div className="settings-field-grid mt-4">
            <LabeledControl label="新用户默认次数">
              <input
                className="settings-input"
                type="number"
                min={0}
                value={form.new_user_quota}
                onChange={(e) => patchField("new_user_quota", Number(e.target.value))}
              />
            </LabeledControl>
          </div>
        </SettingsSurface>
      </SettingsPanel>
    </div>
  );
}
