import { useState } from "react";
import { LabeledControl, SettingsLoading, SettingsPanel, SettingsStatusBar, SettingsTabShell } from "@/components/settings/SettingsPanel";
import { SecretField } from "@/components/settings/SecretField";
import { Switch } from "@/components/ui/switch";
import { useAdminModelSettings } from "@/hooks/useAdminModelSettings";

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
    }, "Đã lưu cấu hình lưu trữ");
    if (!saved) return;
    setOssKeyIdInput("");
    setOssKeySecretInput("");
    setClearOssId(false);
    setClearOssSecret(false);
  }

  if (loading || !form) return <SettingsLoading />;

  const endpoint = form.oss_endpoint.trim().replace(/^https?:\/\//i, "").replace(/\/$/, "");
  const endpointError = form.oss_endpoint.trim() && !/^[a-z\d.-]+(?::\d+)?$/i.test(endpoint)
    ? "Nhập tên miền dịch vụ OSS, không bao gồm tên Bucket hoặc đường dẫn tệp." : undefined;
  const bucketError = form.oss_bucket.trim() && !/^[a-z\d-]+$/.test(form.oss_bucket.trim())
    ? "Chỉ dùng chữ thường, số và dấu gạch ngang; nhập tên, không nhập địa chỉ web." : undefined;
  const publicBase = form.oss_public_base.trim();
  let publicBaseError: string | undefined;
  if (publicBase) {
    try {
      const url = new URL(publicBase);
      if (!["https:", "http:"].includes(url.protocol) || url.search || url.hash) {
        publicBaseError = "Dùng địa chỉ công khai http:// hoặc https://, không kèm tham số truy vấn hoặc neo.";
      }
    } catch { publicBaseError = "Nhập địa chỉ truy cập đầy đủ, ví dụ https://cdn.example.com."; }
  }
  const hasId = !clearOssId && (form.has_oss_access_key_id || Boolean(ossKeyIdInput.trim()));
  const hasSecret = !clearOssSecret && (form.has_oss_access_key_secret || Boolean(ossKeySecretInput.trim()));
  const ossReady = form.oss_enabled && Boolean(endpoint && !endpointError && form.oss_bucket.trim() && !bucketError && hasId && hasSecret);
  const publicEndpoint = endpoint.replace("-internal.aliyuncs.com", ".aliyuncs.com").replace("-internal-accelerate.aliyuncs.com", ".aliyuncs.com");
  const generatedBase = form.oss_bucket.trim() && endpoint && !endpointError && !bucketError ? `https://${form.oss_bucket.trim()}.${publicEndpoint}` : "";
  const accessPreview = publicBase || generatedBase;
  const folder = form.oss_folder.trim().replace(/^\/+|\/+$/g, "") || "kepu";

  return <SettingsTabShell onSave={handleSave} saving={saving} saveLabel="Lưu cài đặt lưu trữ">
    <SettingsStatusBar title="Trạng thái cấu hình lưu trữ" items={[
      { id: "oss", label: "Alibaba Cloud OSS", ready: ossReady, readyText: "Cấu hình đầy đủ", pendingText: form.oss_enabled ? "Vui lòng bổ sung kết nối và thông tin xác thực" : "Chưa bật" },
      { id: "public", label: "Truy cập công khai", ready: Boolean(accessPreview && !publicBaseError), readyText: publicBase ? "Địa chỉ tùy chỉnh" : "Địa chỉ mặc định của Bucket", pendingText: "Chờ cấu hình" },
      { id: "async", label: "Cách tải lên", ready: form.oss_enabled && form.oss_upload_async, readyText: "Tải lên bất đồng bộ", pendingText: form.oss_enabled ? "Tải lên đồng bộ" : "Cần bật OSS" },
    ]} extra={<span className="settings-status-extra">Nguồn cấu hình:{form.source === "db" ? "Trang quản trị" : "Biến môi trường"}</span>} />

    <SettingsPanel title="Kết nối lưu trữ" description="Nghiệp vụ tạo và chợ tài sản số dùng chung Bucket và thông tin xác thực ở đây. Endpoint quyết định nơi tải lên, Bucket là tên không gian lưu trữ.">
      <div className="settings-toggle-row">
        <div><strong>Bật Alibaba Cloud OSS</strong><span>Khi tắt, nghiệp vụ tạo dùng thư mục cục bộ; tải lên và phát tệp của chợ tài sản số không khả dụng.</span></div>
        <Switch aria-label="Bật Alibaba Cloud OSS" checked={form.oss_enabled} onCheckedChange={(value) => patchField("oss_enabled", value)} />
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        Chợ tài sản số luôn dùng thư mục marketplace/, không bị ảnh hưởng bởi cài đặt thư mục nghiệp vụ tạo bên dưới.
        Tệp của chợ được tải lên với quyền riêng tư, truy cập qua chữ ký ngắn hạn, không dùng tên miền công khai.
        Bucket phải ở chế độ riêng tư và không có chính sách Allow ẩn danh; lưu cấu hình ở trang này sẽ không tự sửa quyền của Bucket.
        “Cấu hình đầy đủ” chỉ cho biết các mục đã được điền, quyền thực tế vẫn cần xác minh trên đám mây.
      </p>
      <div className="settings-field-grid mt-5">
        <LabeledControl label="Tên miền dịch vụ Endpoint" required={form.oss_enabled} error={endpointError} hint="Ví dụ oss-cn-beijing.aliyuncs.com; đừng nhập địa chỉ truy cập Bucket.">
          <input className="settings-input" placeholder="oss-cn-beijing.aliyuncs.com" value={form.oss_endpoint} onChange={(event) => patchField("oss_endpoint", event.target.value)} autoCapitalize="none" spellCheck={false} />
        </LabeledControl>
        <LabeledControl label="Không gian lưu trữ Bucket" required={form.oss_enabled} error={bucketError} hint="Trùng với tên trong bảng điều khiển OSS, ví dụ printfilm-media.">
          <input className="settings-input" placeholder="printfilm-media" value={form.oss_bucket} onChange={(event) => patchField("oss_bucket", event.target.value)} autoCapitalize="none" spellCheck={false} maxLength={63} />
        </LabeledControl>
        <LabeledControl label="Khu vực Region" optional hint="Ví dụ cn-beijing, phải cùng khu vực với Endpoint.">
          <input className="settings-input" placeholder="cn-beijing" value={form.oss_region} onChange={(event) => patchField("oss_region", event.target.value)} autoCapitalize="none" spellCheck={false} />
        </LabeledControl>
        <LabeledControl label="Tiền tố thư mục tệp" optional hint="Chỉ dùng cho nghiệp vụ tạo, không chứa tên miền; ví dụ kepu. Để trống dùng thư mục mặc định kepu.">
          <input className="settings-input" placeholder="kepu" value={form.oss_folder} onChange={(event) => patchField("oss_folder", event.target.value)} spellCheck={false} />
        </LabeledControl>
      </div>
    </SettingsPanel>

    <SettingsPanel title="Thông tin truy cập" description="Chỉ nhận thông tin xác thực mới, không hiển thị khóa hiện có. Khi bật OSS cần đủ AccessKey ID và Secret.">
      <div className="settings-field-grid">
        <SecretField label="AccessKey ID" placeholder="Nhập AccessKey ID" value={ossKeyIdInput} configured={form.has_oss_access_key_id} required={form.oss_enabled}
          clearPending={clearOssId} onUndoClear={() => setClearOssId(false)}
          error={form.oss_enabled && clearOssId ? "Vui lòng tắt OSS trước khi xóa thông tin xác thực, hoặc hủy thao tác xóa." : undefined}
          onChange={(value) => { setOssKeyIdInput(value); setClearOssId(false); }} onClear={() => setClearOssId(true)} />
        <SecretField label="AccessKey Secret" placeholder="Nhập AccessKey Secret" value={ossKeySecretInput} configured={form.has_oss_access_key_secret} required={form.oss_enabled}
          clearPending={clearOssSecret} onUndoClear={() => setClearOssSecret(false)}
          error={form.oss_enabled && clearOssSecret ? "Vui lòng tắt OSS trước khi xóa thông tin xác thực, hoặc hủy thao tác xóa." : undefined}
          onChange={(value) => { setOssKeySecretInput(value); setClearOssSecret(false); }} onClear={() => setClearOssSecret(true)} />
      </div>
    </SettingsPanel>

    <SettingsPanel title="Truy cập công khai và CDN" description="Nghiệp vụ tạo xem trước và tải phương tiện qua địa chỉ này; nó được cấu hình tách biệt với Endpoint dùng để tải lên. Chợ tài sản số dùng truy cập có chữ ký, không dùng địa chỉ này.">
      <LabeledControl label="Địa chỉ truy cập tùy chỉnh" optional error={publicBaseError} hint="Khi gắn CDN hoặc tên miền tùy chỉnh, nhập địa chỉ https:// đầy đủ; để trống dùng địa chỉ công khai của Bucket.">
        <input className="settings-input" type="url" placeholder="https://cdn.example.com" value={form.oss_public_base} onChange={(event) => patchField("oss_public_base", event.target.value)} autoCapitalize="none" spellCheck={false} />
      </LabeledControl>
      <div className="admin-form-preview mt-4" aria-live="polite">
        <strong>Xem trước đường dẫn truy cập phương tiện</strong>
        <div className="mt-1 break-all font-mono">{accessPreview && !publicBaseError ? `${accessPreview.replace(/\/$/, "")}/${folder}/generated/…` : "Nhập Endpoint và Bucket để hiển thị đường dẫn truy cập mặc định."}</div>
      </div>
    </SettingsPanel>

    <details className="settings-advanced">
      <summary>Tùy chọn tải lên nâng cao · Cách tải lên và hàng đợi</summary>
      <div>
        <div className="settings-toggle-row">
          <div><strong>Tải lên bất đồng bộ</strong><span>{form.oss_enabled ? "Trả về URL cục bộ trước, rồi hàng đợi nền tải lên; khi tắt thì tải lên đồng bộ." : "Hãy bật OSS trước để điều chỉnh cách tải lên."}</span></div>
          <Switch aria-label="Bật tải lên bất đồng bộ" checked={form.oss_upload_async} disabled={!form.oss_enabled} onCheckedChange={(value) => patchField("oss_upload_async", value)} />
        </div>
        <div className="settings-field-grid mt-5">
          <LabeledControl label="Tên hàng đợi tải lên" required={form.oss_enabled && form.oss_upload_async} hint="Chỉ dùng cho tải lên bất đồng bộ; giữ tên hàng đợi khớp với cấu hình Worker cục bộ.">
            <input className="settings-input" placeholder="Ví dụ oss_upload" value={form.oss_upload_queue} disabled={!form.oss_enabled || !form.oss_upload_async} onChange={(event) => patchField("oss_upload_queue", event.target.value)} spellCheck={false} />
          </LabeledControl>
        </div>
      </div>
    </details>
  </SettingsTabShell>;
}
