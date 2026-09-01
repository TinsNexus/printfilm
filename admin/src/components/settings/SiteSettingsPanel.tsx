import { Globe, Wrench } from "lucide-react";
import { LabeledControl, SectionTitle, SettingsLoading, SettingsPanel, SettingsTabShell } from "@/components/settings/SettingsPanel";
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
    return <SettingsLoading />;
  }

  return (
    <SettingsTabShell onSave={() => void handleSave()} saving={saving}>
      <SettingsPanel title="公网地址" description="支付回调、分享链接与 OSS 回填">
        <SectionTitle icon={<Globe className="h-4 w-4" />} title="PUBLIC_BASE_URL" />
        <div className="settings-field-grid">
          <LabeledControl label="后端公网基址" hint="例：https://api.example.com">
            <input
              className="settings-input"
              value={form.public_base_url}
              onChange={(e) => patchField("public_base_url", e.target.value)}
            />
          </LabeledControl>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-[#909399]">
          数据库、Redis、SECRET_KEY 等基础设施仍通过服务器环境变量配置，不在此页修改。
        </p>
      </SettingsPanel>

      <SettingsPanel title="媒体工具" description="合成与抽帧依赖本机 ffmpeg / ffprobe">
        <SectionTitle icon={<Wrench className="h-4 w-4" />} title="FFmpeg" />
        <div className="settings-field-grid">
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
      </SettingsPanel>
    </SettingsTabShell>
  );
}
