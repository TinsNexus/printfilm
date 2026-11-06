import {
  LabeledControl,
  SettingsLoading,
  SettingsPanel,
  SettingsStatusBar,
  SettingsTabShell,
} from "@/components/settings/SettingsPanel";
import { Switch } from "@/components/ui/switch";
import { useAdminModelSettings } from "@/hooks/useAdminModelSettings";

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
      },
      "Đã lưu cấu hình site",
    );
  }

  if (loading || !form) {
    return <SettingsLoading />;
  }

  const hasPublic = Boolean(form.public_base_url?.trim());
  const hasFfmpeg = Boolean(form.ffmpeg_path?.trim());
  const hasFfprobe = Boolean(form.ffprobe_path?.trim());

  return (
    <SettingsTabShell onSave={handleSave} saving={saving} saveLabel="Lưu cài đặt site">
      <SettingsStatusBar
        title="Trạng thái công cụ site"
        items={[
          {
            id: "public",
            label: "Địa chỉ công khai",
            ready: hasPublic,
            readyText: "Đã cấu hình",
            pendingText: "Chưa nhập",
          },
          {
            id: "ffmpeg",
            label: "ffmpeg",
            ready: hasFfmpeg,
            readyText: form.ffmpeg_path || "Đã cấu hình",
            pendingText: "Dùng PATH mặc định",
          },
          {
            id: "ffprobe",
            label: "ffprobe",
            ready: hasFfprobe,
            readyText: form.ffprobe_path || "Đã cấu hình",
            pendingText: "Dùng PATH mặc định",
          },
          {
            id: "marketplace",
            label: "Chợ tài sản số",
            ready: form.marketplace_enabled,
            readyText: "Đã bật",
            pendingText: "Chưa bật",
          },
        ]}
      />

      <div className="settings-routing-grid">
        <SettingsPanel
          className="settings-panel--compact"
          title="Địa chỉ truy cập site"
          description="Dùng cho callback thanh toán, liên kết chia sẻ và điền lại địa chỉ phương tiện; nhập địa chỉ backend có thể truy cập từ internet."
        >
          <div className="settings-field-grid">
            <LabeledControl
              label="Địa chỉ backend công khai"
              hint="Ví dụ https://www.printfilm.com; để trống dùng cấu hình mặc định của máy chủ."
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
            Cơ sở dữ liệu, Redis, SECRET_KEY và hạ tầng khác vẫn cấu hình qua biến môi trường máy chủ, không sửa ở trang này.
          </p>
        </SettingsPanel>

        <SettingsPanel
          className="settings-panel--compact"
          title="Công cụ xử lý phương tiện"
          description="Ghép video và tách khung hình dùng công cụ trên máy chủ. Nếu đã thêm vào PATH của máy chủ, có thể giữ tên mặc định."
        >
          <div className="settings-field-grid">
            <LabeledControl label="Công cụ xử lý video (ffmpeg)" hint="Có thể nhập tên lệnh hoặc đường dẫn đầy đủ trên máy chủ." optional>
              <input
                className="settings-input"
                placeholder="ffmpeg"
                value={form.ffmpeg_path}
                onChange={(e) => patchField("ffmpeg_path", e.target.value)}
              />
            </LabeledControl>
            <LabeledControl label="Công cụ thông tin phương tiện (ffprobe)" hint="Dùng cùng thư mục cài đặt với ffmpeg." optional>
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
          title="3. Chợ tài sản số"
          description="Khi môi trường thật không có tệp môi trường, mở lối vào tại đây"
        >
          <div className="settings-toggle-row">
            <div>
              <strong>Bật chợ tài sản số</strong>
              <span>Sau khi lưu, trang người dùng sẽ có “Chợ tài sản số”, mục “Nghiệp vụ” của trang quản trị sẽ có “Vận hành nền tảng tài sản số”. Tải lên vẫn dùng “Lưu trữ OSS”.</span>
            </div>
            <Switch
              checked={form.marketplace_enabled}
              onCheckedChange={(value) => patchField("marketplace_enabled", value)}
            />
          </div>
        </SettingsPanel>
      </div>
    </SettingsTabShell>
  );
}
