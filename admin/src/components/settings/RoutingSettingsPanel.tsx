import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, type AdminRoutingSettings } from "@/api/client";
import { LabeledControl, SectionTitle, SettingsPanel, SettingsSurface } from "@/components/settings/SettingsPanel";
import { cn } from "@/lib/utils";

type ChannelDraft = AdminRoutingSettings["system_channels"][number] & {
  api_key_input: string;
};

const CAPABILITY_LABELS: Record<string, string> = {
  text: "文本",
  image: "图像",
  video: "视频",
  audio: "语音",
};

// 渠道 + 逻辑模型路由配置面板
export function RoutingSettingsPanel() {
  const [data, setData] = useState<AdminRoutingSettings | null>(null);
  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<AdminRoutingSettings>("/api/admin/settings/routing");
      setData(res);
      setSelectedChannelId((prev) => prev || res.system_channels[0]?.id || "");
      setApiKeyInputs({});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载路由配置失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const channels = useMemo<ChannelDraft[]>(
    () =>
      (data?.system_channels ?? []).map((channel) => ({
        ...channel,
        api_key_input: apiKeyInputs[channel.id] ?? "",
      })),
    [apiKeyInputs, data],
  );

  const selectedChannel = channels.find((item) => item.id === selectedChannelId) ?? channels[0];

  function updateChannel(channelId: string, patch: Partial<AdminRoutingSettings["system_channels"][number]>) {
    setData((prev) =>
      prev
        ? {
            ...prev,
            system_channels: prev.system_channels.map((item) =>
              item.id === channelId ? { ...item, ...patch } : item,
            ),
          }
        : prev,
    );
  }

  function addChannel() {
    const id = `channel-${Date.now()}`;
    setData((prev) =>
      prev
        ? {
            ...prev,
            system_channels: [
              ...prev.system_channels,
              {
                id,
                name: "新渠道",
                base_url: "",
                api_key: "",
                has_api_key: false,
                api_format: "openai",
                protocol: "auto",
                models: [],
                enabled: true,
                sort_order: prev.system_channels.length,
              },
            ],
          }
        : prev,
    );
    setSelectedChannelId(id);
  }

  function removeChannel(channelId: string) {
    setData((prev) =>
      prev
        ? {
            ...prev,
            system_channels: prev.system_channels.filter((item) => item.id !== channelId),
            logical_models: prev.logical_models
              .map((model) => ({
                ...model,
                bindings: model.bindings.filter((binding) => binding.channel_id !== channelId),
              }))
              .filter((model) => model.bindings.length > 0),
          }
        : prev,
    );
  }

  async function handleSave() {
    if (!data) return;
    setSaving(true);
    try {
      const res = await api<{ settings: AdminRoutingSettings }>("/api/admin/settings/routing", {
        method: "PATCH",
        body: JSON.stringify({
          system_channels: data.system_channels.map((channel) => ({
            id: channel.id,
            name: channel.name,
            base_url: channel.base_url,
            api_key: apiKeyInputs[channel.id]?.trim() || undefined,
            api_format: channel.api_format,
            protocol: channel.protocol,
            models: channel.models,
            enabled: channel.enabled,
            sort_order: channel.sort_order,
          })),
          logical_models: data.logical_models,
          default_models: data.default_models,
        }),
      });
      setData(res.settings);
      setApiKeyInputs({});
      toast.success("路由配置已保存");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="admin-panel flex items-center justify-center py-16 text-[#909399]">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        加载路由配置…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-[#303133]">模型路由</h2>
          <p className="mt-1 text-sm text-[#909399]">上游渠道 + 逻辑模型绑定 + 默认模型</p>
        </div>
        <button
          type="button"
          className="admin-quick-btn !inline-flex !w-auto items-center gap-2 px-4 py-2.5"
          disabled={saving}
          onClick={() => void handleSave()}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          保存路由
        </button>
      </div>

      {(data?.validation_errors.length ?? 0) > 0 ? (
        <SettingsSurface className="border-[#fde2e2] bg-[#fef0f0]">
          <div className="text-sm font-medium text-[#f56c6c]">配置校验</div>
          <ul className="mt-2 space-y-1 text-xs text-[#f56c6c]">
            {data?.validation_errors.map((item) => (
              <li key={item}>· {item}</li>
            ))}
          </ul>
        </SettingsSurface>
      ) : null}

      <SettingsPanel title="上游渠道" description="物理网关：Base URL、协议、上游模型列表。">
        <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
          <div className="space-y-2">
            <button
              type="button"
              className="admin-quick-btn !w-full !flex-row items-center gap-2 px-3 py-2"
              onClick={addChannel}
            >
              <Plus className="h-4 w-4" />
              新增渠道
            </button>
            {channels.map((channel) => (
              <button
                key={channel.id}
                type="button"
                className={cn(
                  "w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                  selectedChannel?.id === channel.id
                    ? "border-[#67c23a] bg-[#f0f9eb]"
                    : "border-[#ebeef5] bg-white hover:border-[#dcdfe6]",
                )}
                onClick={() => setSelectedChannelId(channel.id)}
              >
                <div className="font-medium text-[#303133]">{channel.name}</div>
                <div className="mt-0.5 truncate font-mono text-[11px] text-[#909399]">{channel.id}</div>
              </button>
            ))}
          </div>

          {selectedChannel ? (
            <SettingsSurface>
              <div className="mb-3 flex items-center justify-between gap-2">
                <SectionTitle icon={<Plus className="h-4 w-4" />} title="渠道详情" />
                <button
                  type="button"
                  className="rounded-lg border border-[#fde2e2] px-2 py-1 text-xs text-[#f56c6c]"
                  onClick={() => removeChannel(selectedChannel.id)}
                >
                  <Trash2 className="mr-1 inline h-3.5 w-3.5" />
                  删除
                </button>
              </div>
              <div className="settings-field-grid">
                <LabeledControl label="名称">
                  <input
                    className="settings-input"
                    value={selectedChannel.name}
                    onChange={(e) => updateChannel(selectedChannel.id, { name: e.target.value })}
                  />
                </LabeledControl>
                <LabeledControl label="Base URL">
                  <input
                    className="settings-input"
                    value={selectedChannel.base_url}
                    onChange={(e) => updateChannel(selectedChannel.id, { base_url: e.target.value })}
                  />
                </LabeledControl>
                <LabeledControl label="协议">
                  <select
                    className="settings-select"
                    value={selectedChannel.protocol}
                    onChange={(e) =>
                      updateChannel(selectedChannel.id, {
                        protocol: e.target.value as AdminRoutingSettings["system_channels"][number]["protocol"],
                      })
                    }
                  >
                    <option value="auto">自动</option>
                    <option value="openai">OpenAI</option>
                    <option value="ark">ARK</option>
                    <option value="volc_tts">豆包 TTS</option>
                  </select>
                </LabeledControl>
                <LabeledControl label="API Key" hint={selectedChannel.has_api_key ? "已保存，留空不修改" : undefined}>
                  <input
                    className="settings-input is-secret"
                    type="password"
                    placeholder={selectedChannel.has_api_key ? "已保存，留空则不修改" : "未配置"}
                    value={selectedChannel.api_key_input}
                    onChange={(e) =>
                      setApiKeyInputs((prev) => ({ ...prev, [selectedChannel.id]: e.target.value }))
                    }
                  />
                </LabeledControl>
                <LabeledControl label="上游模型（每行一个）">
                  <textarea
                    className="settings-input min-h-[120px] py-2 font-mono text-xs"
                    value={selectedChannel.models.join("\n")}
                    onChange={(e) =>
                      updateChannel(selectedChannel.id, {
                        models: e.target.value
                          .split("\n")
                          .map((line) => line.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </LabeledControl>
              </div>
            </SettingsSurface>
          ) : null}
        </div>
      </SettingsPanel>

      <SettingsPanel title="逻辑模型" description="保存渠道后会自动 sync 绑定关系。">
        <div className="space-y-3">
          {(data?.logical_models ?? []).map((model) => (
            <SettingsSurface key={model.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium text-[#303133]">{model.name || model.id}</div>
                  <div className="font-mono text-[11px] text-[#909399]">
                    {model.id} · {CAPABILITY_LABELS[model.capability] ?? model.capability}
                  </div>
                </div>
              </div>
              <div className="mt-3 admin-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>渠道</th>
                      <th>上游模型</th>
                      <th>优先级</th>
                    </tr>
                  </thead>
                  <tbody>
                    {model.bindings.map((binding) => {
                      const channel = data?.system_channels.find((item) => item.id === binding.channel_id);
                      return (
                        <tr key={binding.id}>
                          <td>{channel?.name ?? binding.channel_id}</td>
                          <td className="font-mono text-xs">{binding.upstream_model}</td>
                          <td>{binding.priority}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </SettingsSurface>
          ))}
        </div>
      </SettingsPanel>

      <SettingsPanel title="默认模型" description="各能力默认逻辑模型 ID。">
        <div className="settings-field-grid">
          {(["text_model", "image_model", "video_model", "audio_model"] as const).map((key) => (
            <LabeledControl key={key} label={key}>
              <select
                className="settings-select"
                value={data?.default_models[key] ?? ""}
                onChange={(e) =>
                  setData((prev) =>
                    prev
                      ? {
                          ...prev,
                          default_models: { ...prev.default_models, [key]: e.target.value },
                        }
                      : prev,
                  )
                }
              >
                <option value="">未设置</option>
                {(data?.logical_models ?? [])
                  .filter((model) => model.capability === key.replace("_model", ""))
                  .map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name || model.id}
                    </option>
                  ))}
              </select>
            </LabeledControl>
          ))}
        </div>
      </SettingsPanel>
    </div>
  );
}
