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

const RATE_FIELDS = [
  { key: "billing_llm_per_m", label: "LLM văn bản", unit: "tệ / triệu Token" },
  { key: "billing_tts_per_m", label: "Giọng nói TTS", unit: "tệ / triệu Token" },
  { key: "billing_seedream_per_m", label: "Tạo ảnh Seedream (quy tắc tương thích)", unit: "tệ / triệu Token" },
  { key: "billing_seedance_video0", label: "Seedance video0 (quy tắc tương thích)", unit: "tệ / triệu Token" },
  { key: "billing_seedance_video1", label: "Seedance video1 (quy tắc tương thích)", unit: "tệ / triệu Token" },
  { key: "billing_kie_fen_per_credit", label: "Quy đổi điểm KIE", unit: "xu / Credit" },
] as const;
const ESTIMATE_FIELDS = [
  { key: "billing_est_llm_tokens", label: "LLM văn bản", unit: "Token / lần" },
  { key: "billing_est_seedream_tokens", label: "Tạo ảnh Seedream", unit: "Token / lần" },
  { key: "billing_est_tts_tokens", label: "Giọng nói TTS", unit: "Token / lần" },
  { key: "billing_est_seedance_tokens_per_sec", label: "Video Seedance", unit: "Token / giây" },
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
      toast.success("Đã sao chép địa chỉ Webhook Stripe");
    } catch {
      toast.error("Sao chép thất bại, vui lòng sao chép địa chỉ Webhook thủ công");
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
    }, "Đã lưu cài đặt thanh toán, tính phí và thông báo");
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
    return raw === "" ? "请输入整数积分。" : `当前 ${Number(raw).toLocaleString()} 积分；100 积分 = 1 元额度。`;
  };

  return <div className="space-y-5">
    <SettingsTabShell onSave={handleSave} saving={saving} disabled={Boolean(usdRateError)} saveLabel="Lưu cài đặt thanh toán và thông báo">
      <SettingsStatusBar title="Trạng thái thanh toán và thông báo" items={[
        { id: "epay", label: "Epay", ready: epayReady, readyText: "Cấu hình đầy đủ", pendingText: "Chưa hoàn tất kết nối" },
        { id: "stripe", label: "Stripe", ready: stripeReady, readyText: "Cấu hình đầy đủ", pendingText: form.stripe_enabled ? "Vui lòng bổ sung Stripe" : "Chưa bật" },
        { id: "billing", label: "Tính phí theo số dư", ready: form.billing_enabled, readyText: "Đã bật", pendingText: "Đã tắt" },
        { id: "smtp", label: "Gửi email", ready: smtpReady, readyText: "Cấu hình đầy đủ", pendingText: form.smtp_enabled ? "Vui lòng bổ sung SMTP" : "Chưa bật" },
      ]} />

      <SettingsPanel title="Kết nối thanh toán" description="Cấu hình thu tiền Epay. Khóa merchant đã có sẽ không hiển thị lại, nhập khóa mới rồi lưu để thay thế.">
        <div className="settings-field-grid">
          <LabeledControl label="Địa chỉ cổng thanh toán" required={epayInUse} hint="Nhập địa chỉ cổng đầy đủ do nhà cung cấp cấp, ví dụ https://pay.example.com.">
            <input className="settings-input" type="url" placeholder="https://pay.example.com" value={form.epay_api_url} onChange={(event) => patchField("epay_api_url", event.target.value)} autoCapitalize="none" spellCheck={false} />
          </LabeledControl>
          <LabeledControl label="Mã merchant PID" required={epayInUse} hint="Mã merchant trong bảng điều khiển Epay.">
            <input className="settings-input" placeholder="Ví dụ 10001" value={form.epay_pid} onChange={(event) => patchField("epay_pid", event.target.value)} autoCapitalize="none" spellCheck={false} />
          </LabeledControl>
          <SecretField label="Khóa merchant" value={epayKeyInput} configured={form.has_epay_key} required={epayInUse}
            clearPending={clearEpayKey} onUndoClear={() => setClearEpayKey(false)}
            onChange={(value) => { setEpayKeyInput(value); setClearEpayKey(false); }} onClear={() => setClearEpayKey(true)} />
        </div>
        <details className="settings-advanced mt-5">
          <summary>Kết nối nâng cao · Callback và trang hoàn tất thanh toán</summary>
          <div className="settings-field-grid">
            <LabeledControl label="Địa chỉ thông báo bất đồng bộ" optional hint="Ví dụ môi trường thật: https://www.example.com/epay/notify, đường dẫn không chứa /api/.">
              <input className="settings-input" type="url" placeholder="https://www.example.com/epay/notify" value={form.epay_notify_url} onChange={(event) => patchField("epay_notify_url", event.target.value)} autoCapitalize="none" spellCheck={false} />
            </LabeledControl>
            <LabeledControl label="Địa chỉ chuyển hướng sau thanh toán" optional hint="Trang người dùng được đưa về sau khi thanh toán xong, nhập địa chỉ http:// hoặc https:// đầy đủ.">
              <input className="settings-input" type="url" placeholder="https://www.example.com/settings" value={form.epay_return_url} onChange={(event) => patchField("epay_return_url", event.target.value)} autoCapitalize="none" spellCheck={false} />
            </LabeledControl>
          </div>
        </details>
      </SettingsPanel>

      <SettingsPanel title="Kết nối thanh toán Stripe" description="Chọn tiền tệ thu theo ngôn ngữ website: tiếng Trung dùng nhân dân tệ CNY, tiếng Anh dùng đô la Mỹ USD. Báo giá USD quy đổi theo tỷ giá trong trang quản trị, số dư ghi có trên site vẫn tính bằng nhân dân tệ.">
        <div className="settings-toggle-row">
          <div><strong>Bật thanh toán Stripe</strong><span>Sau khi bật và lưu cấu hình đầy đủ, người dùng có thể chọn thanh toán bằng thẻ ngân hàng ở trang nạp tiền.</span></div>
          <Switch aria-label="Bật thanh toán Stripe" checked={Boolean(form.stripe_enabled)} onCheckedChange={(value) => patchField("stripe_enabled", value)} />
        </div>

        <div className="settings-field-grid mt-5">
          <LabeledControl label="Tiền tệ thu của Stripe" hint="Tự động chọn theo ngôn ngữ website hiện tại của người dùng; Alipay và WeChat Pay vẫn dùng nhân dân tệ.">
            <input className="settings-input" readOnly value="Tiếng Trung CNY / tiếng Anh USD (theo ngôn ngữ website)" />
          </LabeledControl>
          <LabeledControl label="Tỷ giá USD sang CNY" optional error={usdRateError}
            hint="1 USD = giá trị nhập CNY; đặt thủ công, tối đa sáu chữ số thập phân. Để trống thì CNY tiếng Trung dùng được, USD tiếng Anh tạm thời không dùng được.">
            <input className="settings-input" type="text" inputMode="decimal" placeholder="Nhập số nhân dân tệ tương ứng 1 đô la Mỹ" value={form.stripe_usd_cny_rate || ""}
              onChange={(event) => patchField("stripe_usd_cny_rate", event.target.value)} autoComplete="off" spellCheck={false} />
          </LabeledControl>
          <SecretField label="Khóa API Stripe" value={stripeKeyInput} configured={Boolean(form.has_stripe_secret_key)} required={form.stripe_enabled}
            placeholder="sk_test_… hoặc sk_live_…" hint="Nhập Secret key trong bảng điều khiển Stripe; trang thanh toán được lưu trữ không cần Publishable key."
            clearPending={clearStripeKey} onUndoClear={() => setClearStripeKey(false)}
            onChange={(value) => { setStripeKeyInput(value); setClearStripeKey(false); }} onClear={() => setClearStripeKey(true)} />
          <SecretField label="Khóa ký Webhook Stripe" value={stripeWebhookInput} configured={Boolean(form.has_stripe_webhook_secret)} required={form.stripe_enabled}
            placeholder="whsec_…" hint="Nhập Signing secret của endpoint Webhook này, dùng để xác minh thông báo thanh toán."
            clearPending={clearStripeWebhook} onUndoClear={() => setClearStripeWebhook(false)}
            onChange={(value) => { setStripeWebhookInput(value); setClearStripeWebhook(false); }} onClear={() => setClearStripeWebhook(true)} />
          <LabeledControl label="Trang quay về sau thanh toán Stripe" optional hint="Nhập nguồn của trang người dùng, không kèm đường dẫn trang; để trống dùng địa chỉ backend công khai của “Công cụ site”. Khi tách frontend/backend nên nhập địa chỉ trang người dùng, ví dụ cục bộ http://127.0.0.1:5183.">
            <input className="settings-input" type="url" placeholder="https://app.example.com" value={form.stripe_frontend_url || ""} onChange={(event) => patchField("stripe_frontend_url", event.target.value)} autoCapitalize="none" spellCheck={false} />
          </LabeledControl>
          <LabeledControl label="Địa chỉ thông báo Webhook Stripe" hint="Thêm endpoint này trong bảng điều khiển Stripe. Tên miền công khai lấy từ địa chỉ backend công khai của “Công cụ site”.">
            <div className="flex items-center gap-2">
              <input className="settings-input min-w-0" readOnly value={form.stripe_webhook_url || "/api/billing/stripe/webhook"} />
              <Button type="button" variant="outline" aria-label="Sao chép địa chỉ thông báo Webhook Stripe" onClick={() => void copyStripeWebhook()}><Copy size={14} />Sao chép</Button>
            </div>
          </LabeledControl>
        </div>
        <p className="settings-panel-footnote">Số tiền USD thanh toán = giá gói nhân dân tệ ÷ tỷ giá USD, làm tròn đến cent. Lưu tỷ giá mới chỉ ảnh hưởng đơn mới, đơn đã tạo thanh toán theo số tiền và tỷ giá lúc đặt; số dư nạp và số dư tặng vẫn tính bằng nhân dân tệ.</p>
        <p className="settings-panel-footnote">Webhook dùng sự kiện Snapshot: checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed và checkout.session.expired. Chỉ cộng số dư sau khi xác nhận thanh toán đã ghi có; khi tắt Stripe, cấu hình hiện có vẫn được giữ.</p>
      </SettingsPanel>

      <SettingsPanel title="Số dư và tính phí" description="Kiểm soát trừ phí khi tạo và quà tặng người dùng mới. Giá hình ảnh và video được phát hành riêng bên dưới, không lưu cùng biểu mẫu này.">
        <div className="settings-toggle-row">
          <div><strong>启用余额计费</strong><span>开启后按规则扣除用户余额；关闭后生成不扣余额。</span></div>
          <Switch aria-label="启用余额计费" checked={form.billing_enabled} onCheckedChange={(value) => patchField("billing_enabled", value)} />
          <label>启用统一钱包（须先核对历史资金来源）<Switch aria-label="启用统一钱包" checked={form.unified_wallet_enabled} onCheckedChange={(value) => patchField("unified_wallet_enabled", value)} /></label>
        </div>
        <p className="settings-panel-footnote">首次启用请使用下方“统一钱包迁移与核对”；此开关不执行迁移。已有统一钱包账户时不能切回旧记账。</p>
        <LabeledControl label="统一钱包环境" hint="独立于 Apple 交易环境。正式站使用 Production；Sandbox 仅用于独立测试库。已有钱包账户或余额后禁止直接切换，不会转换历史资金。">
          <select className="settings-input" value={form.wallet_environment} onChange={event => patchField("wallet_environment", event.target.value as "Production" | "Sandbox")}><option value="Production">Production（正式资金）</option><option value="Sandbox">Sandbox（独立测试资金）</option></select>
        </LabeledControl>
        <div className="settings-field-grid mt-5">
          <LabeledControl label="注册赠送积分" required hint={moneyHint("billing_signup_grant_fen")}>
            <input className="settings-input" type="number" min={0} step={1} placeholder="0" {...numericControl("billing_signup_grant_fen")} />
          </LabeledControl>
        </div>
        <details className="settings-advanced mt-5">
          <summary>Tính phí nâng cao · Đơn giá Token, đệm đóng băng và ước tính mặc định</summary>
          <div>
            <p className="settings-runtime-note">Sau khi giá hình/video được phát hành và bật giá trên site thì ưu tiên dùng giá đã phát hành; đơn giá tương thích bên dưới chỉ dùng cho các lệnh gọi vẫn theo quy tắc tính phí cũ. LLM, TTS tiếp tục theo quy tắc Token.</p>
            <fieldset className="m-0 min-w-0 border-0 p-0" disabled={!form.billing_enabled}>
              <div className="settings-subsection-title">Đơn giá Token và quy đổi điểm</div>
              <div className="settings-field-grid">
                {RATE_FIELDS.map((field) => <LabeledControl key={field.key} label={field.label} required={form.billing_enabled} hint={field.unit}>
                  <input className="settings-input" type="number" min={0} step="any" {...numericControl(field.key)} />
                </LabeledControl>)}
              </div>
              <div className="settings-subsection-title">Ước tính tác vụ</div>
              <div className="settings-field-grid">
                <LabeledControl label="Hệ số đệm đóng băng (lần)" required={form.billing_enabled} hint="Tối thiểu 1; ví dụ 1,2 nghĩa là giữ lại thêm 20% trên chi phí ước tính.">
                  <input className="settings-input" type="number" min={1} step="0.01" {...numericControl("billing_estimate_buffer")} />
                </LabeledControl>
                {ESTIMATE_FIELDS.map((field) => <LabeledControl key={field.key} label={`${field.label} Mức dùng mặc định`} required={form.billing_enabled} hint={`${field.unit}; dùng khi upstream không trả về usage.`}>
                  <input className="settings-input" type="number" min={1} step={1} {...numericControl(field.key)} />
                </LabeledControl>)}
              </div>
            </fieldset>
            {!form.billing_enabled && <p className="settings-panel-footnote">Tính phí theo số dư đang tắt; sau khi bật có thể chỉnh các quy tắc trên, giá trị hiện có được giữ nguyên.</p>}
          </div>
        </details>
      </SettingsPanel>

      <SettingsPanel title="Nhắc nhở chi tiêu" description="Khi tổng chi tiêu của người dùng đạt khoảng số tiền đã đặt, hiển thị nhắc nhở trong sản phẩm.">
        <div className="settings-toggle-row">
          <div><strong>Cửa sổ nhắc chi tiêu cho người dùng</strong><span>Nhắc khi tổng phí bị trừ đạt từng mốc khoảng cách, mỗi lần quyết toán chỉ bật lên tối đa một lần.</span></div>
          <Switch aria-label="Cửa sổ nhắc chi tiêu cho người dùng" checked={form.billing_user_alert_enabled} disabled={!form.billing_enabled} onCheckedChange={(value) => patchField("billing_user_alert_enabled", value)} />
        </div>
        <div className="settings-field-grid mt-5">
          <LabeledControl label="消费提醒间隔（积分）" required={form.billing_enabled && form.billing_user_alert_enabled} hint={form.billing_enabled ? moneyHint("billing_user_alert_interval_fen") : "需先启用余额计费；原提醒设置保留。"}>
            <input className="settings-input" type="number" min={1} step={1} disabled={!form.billing_enabled || !form.billing_user_alert_enabled} {...numericControl("billing_user_alert_interval_fen")} />
          </LabeledControl>
        </div>
      </SettingsPanel>

      <details className="settings-advanced" open={form.smtp_enabled || undefined}>
        <summary>Gửi email SMTP · {form.smtp_enabled ? "Đã bật" : "Chưa bật, bấm để cấu hình"}</summary>
        <SettingsPanel title="Gửi email" description="Dùng cho email đặt lại mật khẩu, mời nhóm, v.v. Dùng dịch vụ SMTP và mã ủy quyền của nhà cung cấp email; khi tắt, cấu hình hiện có vẫn được giữ.">
          <div className="settings-toggle-row">
            <div><strong>Bật gửi email SMTP</strong><span>Sau khi bật và lưu cấu hình, có thể gửi email đặt lại mật khẩu, mời nhóm, v.v.</span></div>
            <Switch aria-label="Bật gửi email SMTP" checked={form.smtp_enabled} onCheckedChange={(value) => patchField("smtp_enabled", value)} />
          </div>
          <div className="settings-field-grid mt-5">
            <LabeledControl label="Máy chủ SMTP" required={form.smtp_enabled} hint="Chỉ nhập tên máy chủ, không có https://, ví dụ smtp.example.com.">
              <input className="settings-input" disabled={!form.smtp_enabled} placeholder="smtp.example.com" value={form.smtp_host} onChange={(event) => patchField("smtp_host", event.target.value)} autoCapitalize="none" spellCheck={false} pattern="[^/:\s]+" />
            </LabeledControl>
            <LabeledControl label="Cổng SMTP" required={form.smtp_enabled} hint="1–65535; 587 thường dùng cho STARTTLS, 465 dùng SSL ngầm định.">
              <input className="settings-input" type="number" disabled={!form.smtp_enabled} min={1} max={65535} step={1} placeholder="587" {...numericControl("smtp_port")} />
            </LabeledControl>
            <LabeledControl label="Địa chỉ người gửi" required={form.smtp_enabled} hint="Địa chỉ email người nhận nhìn thấy, ví dụ notice@example.com.">
              <input className="settings-input" type="email" disabled={!form.smtp_enabled} placeholder="notice@example.com" value={form.smtp_from} onChange={(event) => patchField("smtp_from", event.target.value)} autoCapitalize="none" spellCheck={false} />
            </LabeledControl>
            <LabeledControl label="Tên đăng nhập SMTP" optional hint="Nhập khi nhà cung cấp yêu cầu xác thực, thường giống email gửi; relay không cần xác thực có thể để trống.">
              <input className="settings-input" disabled={!form.smtp_enabled} placeholder="notice@example.com" value={form.smtp_user} onChange={(event) => patchField("smtp_user", event.target.value)} autoCapitalize="none" spellCheck={false} />
            </LabeledControl>
            <SecretField label="Mật khẩu SMTP / mã ủy quyền" value={smtpPasswordInput} configured={form.has_smtp_password} required={smtpNeedsPassword}
              clearPending={clearSmtpPassword} onUndoClear={() => setClearSmtpPassword(false)}
              hint="Đa số hộp thư dùng mã ủy quyền SMTP; khi tắt vẫn có thể cập nhật hoặc xóa thông tin xác thực."
              error={smtpNeedsPassword && clearSmtpPassword ? "Vui lòng tắt SMTP hoặc xóa tên đăng nhập của relay không cần xác thực trước, rồi mới xóa mật khẩu." : undefined}
              onChange={(value) => { setSmtpPasswordInput(value); setClearSmtpPassword(false); }} onClear={() => setClearSmtpPassword(true)} />
            <LabeledControl label="Mã hóa STARTTLS" hint={[465, 8465, 2465].includes(form.smtp_port) ? "Cổng hiện tại dùng SSL ngầm định, công tắc này không ảnh hưởng mã hóa." : "Cổng 587 thường bật; tùy theo yêu cầu của nhà cung cấp email."}>
              <div className="settings-inline-switch">
                <Switch aria-label="Bật mã hóa SMTP STARTTLS" disabled={!form.smtp_enabled || [465, 8465, 2465].includes(form.smtp_port)} checked={form.smtp_use_tls} onCheckedChange={(value) => patchField("smtp_use_tls", value)} />
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
