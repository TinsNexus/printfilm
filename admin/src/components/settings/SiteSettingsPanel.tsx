import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  LabeledControl,
  SettingsLoading,
  SettingsPanel,
  SettingsStatusBar,
  SettingsTabShell,
} from "@/components/settings/SettingsPanel";
import { Button } from "@/components/ui/button";
import { api, type AdminModelSettings } from "@/api/client";
import { useAdminModelSettings } from "@/hooks/useAdminModelSettings";

/** 把相对 /static 路径拼成可预览地址（走当前管理端同源代理） */
function previewSrc(url: string | undefined | null): string {
  const raw = (url || "").trim();
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("data:")) {
    return raw;
  }
  return raw;
}

/** 站点 URL、媒体工具与微信群二维码 */
export function SiteSettingsPanel() {
  const { form, loading, saving, patchField, save, load } = useAdminModelSettings();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleSave() {
    if (!form) return;
    await save(
      {
        public_base_url: form.public_base_url,
        ffmpeg_path: form.ffmpeg_path,
        ffprobe_path: form.ffprobe_path,
        wechat_group_qr_url: form.wechat_group_qr_url,
      },
      "站点配置已保存",
    );
  }

  // 上传并立刻写入 settings.wechat_group_qr_url
  async function onPickFile(file: File | null) {
    if (!file) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      await api<{ wechat_group_qr_url: string; settings: AdminModelSettings }>(
        "/api/admin/settings/site/wechat-group-qr",
        { method: "POST", body },
      );
      await load();
      toast.success("微信群二维码已更新");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  if (loading || !form) {
    return <SettingsLoading />;
  }

  const hasPublic = Boolean(form.public_base_url?.trim());
  const hasFfmpeg = Boolean(form.ffmpeg_path?.trim());
  const hasFfprobe = Boolean(form.ffprobe_path?.trim());
  const qrUrl = (form.wechat_group_qr_url || "").trim();
  const hasQr = Boolean(qrUrl);
  const qrPreview = previewSrc(qrUrl);

  return (
    <SettingsTabShell onSave={() => void handleSave()} saving={saving || uploading}>
      <SettingsStatusBar
        title="站点工具状态"
        items={[
          {
            id: "public",
            label: "公网地址",
            ready: hasPublic,
            readyText: "已配置",
            pendingText: "未填写",
          },
          {
            id: "ffmpeg",
            label: "ffmpeg",
            ready: hasFfmpeg,
            readyText: form.ffmpeg_path || "已配置",
            pendingText: "使用默认 PATH",
          },
          {
            id: "ffprobe",
            label: "ffprobe",
            ready: hasFfprobe,
            readyText: form.ffprobe_path || "已配置",
            pendingText: "使用默认 PATH",
          },
          {
            id: "wechat",
            label: "微信群二维码",
            ready: hasQr,
            readyText: "已配置",
            pendingText: "未上传",
          },
        ]}
      />

      <div className="settings-routing-grid">
        <SettingsPanel
          className="settings-panel--compact"
          title="1. 公网地址"
          description="支付回调、分享链接与 OSS 回填"
        >
          <div className="settings-field-grid">
            <LabeledControl
              label="后端公网基址"
              hint="例：https://www.printfilm.com"
              className="settings-field-span-full"
            >
              <input
                className="settings-input"
                value={form.public_base_url}
                onChange={(e) => patchField("public_base_url", e.target.value)}
              />
            </LabeledControl>
          </div>
          <p className="settings-panel-footnote">
            数据库、Redis、SECRET_KEY 等基础设施仍通过服务器环境变量配置，不在此页修改。
          </p>
        </SettingsPanel>

        <SettingsPanel
          className="settings-panel--compact"
          title="2. 媒体工具"
          description="合成与抽帧依赖本机 ffmpeg / ffprobe"
        >
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

        <SettingsPanel
          className="settings-panel--compact settings-field-span-full"
          title="3. 微信用户群二维码"
          description="官网右下角「加群」浮钮；微信邀请码约 7 天有效，过期后在此更换"
        >
          <div className="settings-field-grid">
            <LabeledControl
              label="当前二维码"
              hint="支持 JPG / PNG / WebP，不超过 5MB"
              className="settings-field-span-full"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <div className="flex h-[180px] w-[180px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/40">
                  {qrPreview ? (
                    <img
                      src={qrPreview}
                      alt="微信群二维码预览"
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <span className="px-3 text-center text-xs text-muted-foreground">暂无图片</span>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                    className="hidden"
                    onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={uploading}
                      onClick={() => fileRef.current?.click()}
                    >
                      {uploading ? "上传中…" : "上传新二维码"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={uploading || !hasQr}
                      onClick={() => patchField("wechat_group_qr_url", "")}
                    >
                      清空地址
                    </Button>
                  </div>
                  <LabeledControl label="图片 URL（可手改）" className="settings-field-span-full">
                    <input
                      className="settings-input"
                      placeholder="/static/site/wechat_group_qr.png"
                      value={form.wechat_group_qr_url || ""}
                      onChange={(e) => patchField("wechat_group_qr_url", e.target.value)}
                    />
                  </LabeledControl>
                  <p className="settings-panel-footnote">
                    上传会立即生效并写入配置；手改 URL 后需点右上角「保存」。前台通过{" "}
                    <code>/api/site-config</code> 拉取。
                  </p>
                </div>
              </div>
            </LabeledControl>
          </div>
        </SettingsPanel>
      </div>
    </SettingsTabShell>
  );
}
