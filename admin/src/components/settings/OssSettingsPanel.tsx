import { useMemo, useState } from "react";
import { Cloud } from "lucide-react";
import { LabeledControl, SectionTitle, SettingsLoading, SettingsPanel, SettingsSurface, SettingsTabShell } from "@/components/settings/SettingsPanel";
import { SecretField } from "@/components/settings/SecretField";
import { Switch } from "@/components/ui/switch";
import { useAdminModelSettings } from "@/hooks/useAdminModelSettings";
import { cn } from "@/lib/utils";

// OSS / TOS / CDN 存储配置
export function OssSettingsPanel() {
  const { form, loading, saving, patchField, save } = useAdminModelSettings();
  const [ossKeyIdInput, setOssKeyIdInput] = useState("");
  const [ossKeySecretInput, setOssKeySecretInput] = useState("");
  const [tosKeyInput, setTosKeyInput] = useState("");
  const [tosSecretInput, setTosSecretInput] = useState("");
  const [clearOssId, setClearOssId] = useState(false);
  const [clearOssSecret, setClearOssSecret] = useState(false);
  const [clearTosKey, setClearTosKey] = useState(false);
  const [clearTosSecret, setClearTosSecret] = useState(false);

  const ossReady = useMemo(() => {
    if (!form?.oss_enabled) return false;
    const hasCreds =
      (form.has_oss_access_key_id && !clearOssId) || ossKeyIdInput.trim().length > 0;
    const hasSecret =
      (form.has_oss_access_key_secret && !clearOssSecret) || ossKeySecretInput.trim().length > 0;
    return Boolean(form.oss_bucket && hasCreds && hasSecret);
  }, [form, clearOssId, clearOssSecret, ossKeyIdInput, ossKeySecretInput]);

  async function handleSave() {
    if (!form) return;
    await save(
      {
        oss_enabled: form.oss_enabled,
        oss_endpoint: form.oss_endpoint,
        oss_region: form.oss_region,
        oss_bucket: form.oss_bucket,
        oss_folder: form.oss_folder,
        oss_public_base: form.oss_public_base,
        oss_upload_async: form.oss_upload_async,
        oss_upload_queue: form.oss_upload_queue,
        oss_access_key_id: ossKeyIdInput.trim() || undefined,
        oss_access_key_secret: ossKeySecretInput.trim() || undefined,
        clear_oss_access_key_id: clearOssId,
        clear_oss_access_key_secret: clearOssSecret,
        tos_endpoint: form.tos_endpoint,
        tos_bucket: form.tos_bucket,
        tos_access_key: tosKeyInput.trim() || undefined,
        tos_secret_key: tosSecretInput.trim() || undefined,
        clear_tos_access_key: clearTosKey,
        clear_tos_secret_key: clearTosSecret,
        cdn_base: form.cdn_base,
      },
      "存储配置已保存",
    );
    setOssKeyIdInput("");
    setOssKeySecretInput("");
    setTosKeyInput("");
    setTosSecretInput("");
    setClearOssId(false);
    setClearOssSecret(false);
    setClearTosKey(false);
    setClearTosSecret(false);
  }

  if (loading || !form) {
    return <SettingsLoading />;
  }

  return (
    <SettingsTabShell onSave={() => void handleSave()} saving={saving}>
      <SettingsSurface>
        <SectionTitle icon={<Cloud className="h-4 w-4" />} title="OSS 状态" />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className={cn("admin-status-pill", ossReady ? "is-done" : form.oss_enabled ? "is-warn" : "")}>
            {form.oss_enabled ? (ossReady ? "OSS 已就绪" : "已启用但凭证不完整") : "OSS 未启用"}
          </span>
          <span className="text-xs text-[#909399]">配置来源：{form.source === "db" ? "管理端" : "环境变量"}</span>
        </div>
      </SettingsSurface>

      <SettingsPanel title="阿里云 OSS" description="生成文件先落本地，再异步上传 OSS">
        <div className="settings-toggle-row">
          <div>
            <strong>启用 OSS</strong>
            <span>关闭后仅使用本地静态目录</span>
          </div>
          <Switch checked={form.oss_enabled} onCheckedChange={(v) => patchField("oss_enabled", v)} />
        </div>
        <div className="settings-field-grid mt-2">
            <LabeledControl label="Endpoint">
              <input
                className="settings-input"
                placeholder="oss-cn-beijing.aliyuncs.com"
                value={form.oss_endpoint}
                onChange={(e) => patchField("oss_endpoint", e.target.value)}
              />
            </LabeledControl>
            <LabeledControl label="Region">
              <input
                className="settings-input"
                placeholder="cn-hangzhou"
                value={form.oss_region}
                onChange={(e) => patchField("oss_region", e.target.value)}
              />
            </LabeledControl>
            <LabeledControl label="Bucket">
              <input
                className="settings-input"
                value={form.oss_bucket}
                onChange={(e) => patchField("oss_bucket", e.target.value)}
              />
            </LabeledControl>
            <LabeledControl label="目录前缀">
              <input
                className="settings-input"
                placeholder="kepu"
                value={form.oss_folder}
                onChange={(e) => patchField("oss_folder", e.target.value)}
              />
            </LabeledControl>
            <LabeledControl label="公网访问基址" hint="留空则自动拼 https://{bucket}.{endpoint}">
              <input
                className="settings-input"
                placeholder="https://cdn.example.com"
                value={form.oss_public_base}
                onChange={(e) => patchField("oss_public_base", e.target.value)}
              />
            </LabeledControl>
            <LabeledControl label="上传队列名">
              <input
                className="settings-input"
                value={form.oss_upload_queue}
                onChange={(e) => patchField("oss_upload_queue", e.target.value)}
              />
            </LabeledControl>
            <SecretField
              label="AccessKey ID"
              value={ossKeyIdInput}
              configured={form.has_oss_access_key_id && !clearOssId}
              onChange={setOssKeyIdInput}
              onClear={() => {
                setOssKeyIdInput("");
                setClearOssId(true);
              }}
            />
            <SecretField
              label="AccessKey Secret"
              value={ossKeySecretInput}
              configured={form.has_oss_access_key_secret && !clearOssSecret}
              onChange={setOssKeySecretInput}
              onClear={() => {
                setOssKeySecretInput("");
                setClearOssSecret(true);
              }}
            />
          </div>
        <div className="settings-toggle-row mt-2">
          <div>
            <strong>异步上传</strong>
            <span>先返回本地 URL，后台队列上传 OSS</span>
          </div>
          <Switch checked={form.oss_upload_async} onCheckedChange={(v) => patchField("oss_upload_async", v)} />
        </div>
      </SettingsPanel>

      <SettingsPanel title="火山 TOS（可选）" description="历史存储方案，新项目可只配 OSS">
        <div className="settings-field-grid">
            <LabeledControl label="Endpoint">
              <input
                className="settings-input"
                value={form.tos_endpoint}
                onChange={(e) => patchField("tos_endpoint", e.target.value)}
              />
            </LabeledControl>
            <LabeledControl label="Bucket">
              <input
                className="settings-input"
                value={form.tos_bucket}
                onChange={(e) => patchField("tos_bucket", e.target.value)}
              />
            </LabeledControl>
            <LabeledControl label="CDN 基址">
              <input
                className="settings-input"
                placeholder="http://localhost:8000/static"
                value={form.cdn_base}
                onChange={(e) => patchField("cdn_base", e.target.value)}
              />
            </LabeledControl>
            <SecretField
              label="TOS Access Key"
              value={tosKeyInput}
              configured={form.has_tos_access_key && !clearTosKey}
              onChange={setTosKeyInput}
              onClear={() => {
                setTosKeyInput("");
                setClearTosKey(true);
              }}
            />
            <SecretField
              label="TOS Secret Key"
              value={tosSecretInput}
              configured={form.has_tos_secret_key && !clearTosSecret}
              onChange={setTosSecretInput}
              onClear={() => {
                setTosSecretInput("");
                setClearTosSecret(true);
              }}
          />
        </div>
      </SettingsPanel>
    </SettingsTabShell>
  );
}
