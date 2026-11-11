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
        marketplace_app_enabled: form.marketplace_app_enabled,
        marketplace_social_initialization_enabled: form.marketplace_social_initialization_enabled,
        marketplace_sharing_enabled: form.marketplace_sharing_enabled,
        marketplace_share_base_url: (form.marketplace_share_base_url || '').trim(),
        marketplace_share_apple_team_id: (form.marketplace_share_apple_team_id || '').trim(),
        marketplace_share_android_package_name: (form.marketplace_share_android_package_name || '').trim(),
        marketplace_share_android_sha256_fingerprints: (form.marketplace_share_android_sha256_fingerprints || '').trim(),
        marketplace_max_duration_seconds: form.marketplace_max_duration_seconds,
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
          {
            id: "marketplace-app",
            label: "App 视频",
            ready: form.marketplace_app_enabled,
            readyText: "已启用",
            pendingText: "未启用",
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
          <div className="settings-toggle-row">
            <div>
              <strong>启用 App 视频服务</strong>
              <span>保存后开放 App 视频列表和播放。在这里开关即可，不需要改容器环境变量。需要同时启用数字资产市场。</span>
            </div>
            <Switch
              checked={form.marketplace_app_enabled}
              onCheckedChange={(value) => patchField("marketplace_app_enabled", value)}
            />
          </div>
          <LabeledControl
            label="完整视频最长时长"
            hint="单位为秒。默认 1800，即 30 分钟。上传、合成和 App 完整播放共用。试看仍最多 15 秒，且不超过原片时长的 30%。"
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
        <SettingsPanel className="settings-panel--compact" title="4. App 互动与作品分享" description="初始化数量、真实分享与 iOS / Android 链接关联均在这里配置，无需修改环境文件。">
          <div className="settings-toggle-row"><div><strong>自动初始化互动数量</strong><span>为新上架且符合 App 展示条件的单视频和分集生成一次初始数量。历史作品请到数字资产平台运营的作品运营页批量补齐；关闭不会清除已保存数量。</span></div><Switch checked={form.marketplace_social_initialization_enabled ?? false} onCheckedChange={value => patchField("marketplace_social_initialization_enabled", value)} /></div>
          <div className="settings-toggle-row"><div><strong>启用作品分享</strong><span>允许分享单视频和当前短剧分集的业务链接。需要有效的公网 HTTPS 域名，不能填写 localhost 或局域网地址。</span></div><Switch checked={form.marketplace_sharing_enabled ?? false} onCheckedChange={value => patchField("marketplace_sharing_enabled", value)} /></div>
          <div className="settings-field-grid">
            <LabeledControl label="分享公网基址" hint="例如 https://www.printfilm.com；域名应将 /s/、/.well-known/apple-app-site-association 和 /.well-known/assetlinks.json 转发至后端，其余作品页面交给 Web。" className="settings-field-span-full"><input className="settings-input" type="url" value={form.marketplace_share_base_url ?? ''} onChange={event => patchField("marketplace_share_base_url", event.target.value)} placeholder="https://www.printfilm.com" /></LabeledControl>
            <LabeledControl label="Apple Team ID" hint="Apple 开发者账号中的 Team ID，用于 Universal Links 关联。"><input className="settings-input" value={form.marketplace_share_apple_team_id ?? ''} maxLength={10} onChange={event => patchField("marketplace_share_apple_team_id", event.target.value)} placeholder="ABCDEFGHIJ" /></LabeledControl>
            <LabeledControl label="Android 包名" hint="与安卓应用 applicationId 一致；与证书指纹一起填写。不需要配置 Apple 即可使用安卓分享。"><input className="settings-input" value={form.marketplace_share_android_package_name ?? ''} maxLength={255} onChange={event => patchField("marketplace_share_android_package_name", event.target.value)} placeholder="com.example.app" /></LabeledControl>
            <LabeledControl label="Android 签名证书 SHA-256 指纹" hint="每行一条32组冒号分隔的指纹。Google Play 使用应用签名证书，不是上传证书；支持轮换期间多个指纹。公网需放行 /.well-known/assetlinks.json。" className="settings-field-span-full"><textarea className="settings-input" rows={4} maxLength={10000} value={form.marketplace_share_android_sha256_fingerprints ?? ''} onChange={event => patchField("marketplace_share_android_sha256_fingerprints", event.target.value)} placeholder="AA:BB:…（完整 SHA-256 指纹）" /></LabeledControl>
            <LabeledControl label="iOS Bundle ID" hint="仅 iOS 使用；复用“支付与通知 → Apple 服务器连接”中的 Bundle ID，安卓无需填写。"><input className="settings-input" readOnly value={form.apple_bundle_id || 'iOS 尚未配置'} /></LabeledControl>
          </div>
          <p className="settings-panel-footnote">iOS 需配置 Associated Domains，Android 需配置 App Links 并使用实际发布签名完成真机验证。保存域名不会自动修改 DNS、反向代理或客户端工程。</p>
        </SettingsPanel>
      </div>
    </SettingsTabShell>
  );
}
