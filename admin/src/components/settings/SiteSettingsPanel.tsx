import { Globe, Loader2, Save, Wrench } from "lucide-react";
import { LabeledControl, SectionTitle, SettingsPanel, SettingsSurface } from "@/components/settings/SettingsPanel";
import { useAdminModelSettings } from "@/hooks/useAdminModelSettings";

// 站点 URL 与本地工具路径
export function SiteSettingsPanel() {
  const { form, loading, saving, patchField, save } = useAdminModelSettings();

  async function handleSave() {
    if (!form) return;
    await save(
      {
        public_base_url: form.public_base_url,
        ffmpeg_path: form.ffmpeg_path,
        ffprobe_path: form.ffprobe_path,
      },
      "站点配置已保存",
    );
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
          <h2 className="text-xl font-semibold text-[#303133]">站点与工具</h2>
          <p className="mt-1 text-sm text-[#909399]">公网基址、回调拼接与 FFmpeg 可执行路径</p>
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

      <SettingsPanel title="公网地址" description="用于支付回调、分享链接与 OSS 回填后的绝对 URL。">
        <SettingsSurface>
          <SectionTitle icon={<Globe className="h-4 w-4" />} title="PUBLIC_BASE_URL" />
          <div className="settings-field-grid mt-4">
            <LabeledControl label="后端公网基址" hint="例：https://api.example.com 或 http://127.0.0.1:8000">
              <input
                className="settings-input"
                value={form.public_base_url}
                onChange={(e) => patchField("public_base_url", e.target.value)}
              />
            </LabeledControl>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-[#909399]">
            数据库、Redis、SECRET_KEY 等基础设施仍通过服务器环境变量配置，不在此页修改。
          </p>
        </SettingsSurface>
      </SettingsPanel>

      <SettingsPanel title="媒体工具" description="合成与抽帧依赖本机 ffmpeg / ffprobe。">
        <SettingsSurface>
          <SectionTitle icon={<Wrench className="h-4 w-4" />} title="FFmpeg" />
          <div className="settings-field-grid mt-4">
            <LabeledControl label="ffmpeg 路径">
              <input
                className="settings-input"
                placeholder="ffmpeg"
                value={form.ffmpeg_path}
                onChange={(e) => patchField("ffmpeg_path", e.target.value)}
              />
            </LabeledControl>
            <LabeledControl label="ffprobe 路径">
              <input
                className="settings-input"
                placeholder="ffprobe"
                value={form.ffprobe_path}
                onChange={(e) => patchField("ffprobe_path", e.target.value)}
              />
            </LabeledControl>
          </div>
        </SettingsSurface>
      </SettingsPanel>
    </div>
  );
}
