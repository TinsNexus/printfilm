import { useCallback, useEffect, useMemo, useState } from "react";
import { Mic, Plus, Trash2, Type } from "lucide-react";
import { toast } from "sonner";
import { api, type AdminRoutingSettings } from "@/api/client";
import {
  ArkVolcMediaPanel,
  ARK_BASE,
  ARK_VOLC_CHANNEL_ID,
  consolidateArkVolcChannels,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
  inferVolcMediaDraft,
  resolveDefaultModelsFromUpstream,
  type VolcMediaDraft,
} from "@/components/settings/ArkVolcMediaPanel";
import { LabeledControl, SectionTitle, SettingsLoading, SettingsPanel, SettingsSurface, SettingsTabShell } from "@/components/settings/SettingsPanel";
import { cn } from "@/lib/utils";

type ChannelDraft = AdminRoutingSettings["system_channels"][number] & {
  api_key_input: string;
};

type Capability = "text" | "image" | "video" | "audio";

const CAPABILITY_LABELS: Record<Capability, string> = {
  text: "文本",
  image: "图像",
  video: "视频",
  audio: "语音",
};

// 与后端 infer_model_capability 对齐，用于渠道能力徽标
function inferCapability(model: string, protocol: string): Capability {
  const mid = (model || "").trim().toLowerCase().replace(/\s+/g, "");
  const proto = (protocol || "auto").toLowerCase();
  if (proto === "openai") return "text";
  if (proto === "volc_tts") return "audio";
  if (!mid) return "text";
  if (mid.includes("tts") || mid.startsWith("zh_") || mid.includes("speaker") || mid.startsWith("s_")) {
    return "audio";
  }
  if (mid.includes("seedance") || mid.includes("video") || mid.includes("i2v")) return "video";
  if (mid.includes("seedream") || mid.includes("dream") || mid.includes("image")) return "image";
  if (proto === "ark") return "image";
  return "text";
}

function channelCapabilities(channel: AdminRoutingSettings["system_channels"][number]): Capability[] {
  const caps = new Set<Capability>();
  for (const model of channel.models) {
    caps.add(inferCapability(model, channel.protocol));
  }
  if (caps.size === 0 && channel.protocol === "ark") caps.add("image");
  if (caps.size === 0 && channel.protocol === "volc_tts") caps.add("audio");
  if (caps.size === 0) caps.add("text");
  return Array.from(caps);
}

// 渠道 + 逻辑模型路由配置面板
export function RoutingSettingsPanel() {
  const [data, setData] = useState<AdminRoutingSettings | null>(null);
  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [volcDraft, setVolcDraft] = useState<VolcMediaDraft>({
    imageModel: "",
    image45Model: "",
    videoModel: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<AdminRoutingSettings>("/api/admin/settings/routing");
      const arkChannel =
        res.system_channels.find((c) => c.id === ARK_VOLC_CHANNEL_ID) ??
        res.system_channels.find((c) => c.protocol === "ark");
      setVolcDraft(inferVolcMediaDraft(arkChannel?.models ?? [], inferCapability));
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

  const otherChannels = useMemo(
    () => channels.filter((item) => item.id !== ARK_VOLC_CHANNEL_ID),
    [channels],
  );
  const selectedChannel =
    otherChannels.find((item) => item.id === selectedChannelId) ?? otherChannels[0];
  const arkVolcChannel =
    channels.find((c) => c.id === ARK_VOLC_CHANNEL_ID) ?? channels.find((c) => c.protocol === "ark");
  const hasVideoChannel = Boolean(volcDraft.videoModel || arkVolcChannel);
  const videoLogicalModels = (data?.logical_models ?? []).filter((m) => m.capability === "video");

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

  function insertChannel(channel: AdminRoutingSettings["system_channels"][number]) {
    setData((prev) =>
      prev
        ? {
            ...prev,
            system_channels: [...prev.system_channels, channel],
          }
        : prev,
    );
    setSelectedChannelId(channel.id);
  }

  // 空白通用渠道
  function addChannel() {
    const id = `channel-${Date.now()}`;
    insertChannel({
      id,
      name: "新渠道",
      base_url: "",
      api_key: "",
      has_api_key: false,
      api_format: "openai",
      protocol: "auto",
      models: [],
      enabled: true,
      sort_order: channels.length,
    });
  }

  // 快捷新增：视频 / 图像 / 文本 / 语音
  function addPreset(kind: Capability) {
    const stamp = Date.now();
    if (kind === "video") {
      insertChannel({
        id: `ark-video-${stamp}`,
        name: "火山方舟视频",
        base_url: ARK_BASE,
        api_key: "",
        has_api_key: false,
        api_format: "ark",
        protocol: "ark",
        models: [DEFAULT_VIDEO_MODEL],
        enabled: true,
        sort_order: channels.length,
      });
      toast.message("已加入视频渠道草稿", {
        description: "填写方舟 API Key，确认上游 Seedance 模型 ID 后点「保存路由」",
      });
      return;
    }
    if (kind === "image") {
      insertChannel({
        id: `ark-image-${stamp}`,
        name: "火山方舟生图",
        base_url: ARK_BASE,
        api_key: "",
        has_api_key: false,
        api_format: "ark",
        protocol: "ark",
        models: [DEFAULT_IMAGE_MODEL],
        enabled: true,
        sort_order: channels.length,
      });
      return;
    }
    if (kind === "audio") {
      insertChannel({
        id: `volc-tts-${stamp}`,
        name: "豆包语音 TTS",
        base_url: "",
        api_key: "",
        has_api_key: false,
        api_format: "openai",
        protocol: "volc_tts",
        models: ["zh_female_cancan_mars_bigtts"],
        enabled: true,
        sort_order: channels.length,
      });
      return;
    }
    insertChannel({
      id: `openai-text-${stamp}`,
      name: "OpenAI 兼容文本",
      base_url: "https://api.openai.com/v1",
      api_key: "",
      has_api_key: false,
      api_format: "openai",
      protocol: "openai",
      models: [],
      enabled: true,
      sort_order: channels.length,
    });
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
      const existingArk = data.system_channels.find((c) => c.id === ARK_VOLC_CHANNEL_ID) ?? arkVolcChannel;
      const { channels: mergedChannels } = consolidateArkVolcChannels(
        data.system_channels,
        volcDraft,
        existingArk,
      );

      const res = await api<{ settings: AdminRoutingSettings }>("/api/admin/settings/routing", {
        method: "PATCH",
        body: JSON.stringify({
          system_channels: mergedChannels.map((channel) => ({
            id: channel.id,
            name: channel.name,
            base_url: channel.base_url,
            api_key: apiKeyInputs[channel.id]?.trim() || undefined,
            api_format: channel.api_format,
            protocol: channel.protocol,
            models: channel.id === ARK_VOLC_CHANNEL_ID
              ? [...new Set([volcDraft.imageModel, volcDraft.image45Model, volcDraft.videoModel].filter(Boolean))]
              : channel.models,
            enabled: channel.enabled,
            sort_order: channel.sort_order,
          })),
          logical_models: data.logical_models,
          default_models: data.default_models,
        }),
      });

      let nextDefaults = resolveDefaultModelsFromUpstream(res.settings, volcDraft);
      if (!nextDefaults.video_model) {
        const preferred =
          res.settings.logical_models.find((m) => m.capability === "video" && m.id === "seedance-2.5") ??
          res.settings.logical_models.find((m) => m.capability === "video");
        if (preferred) nextDefaults = { ...nextDefaults, video_model: preferred.id };
      }

      const arkKey = apiKeyInputs[ARK_VOLC_CHANNEL_ID]?.trim();
      if (
        nextDefaults.image_model !== res.settings.default_models.image_model ||
        nextDefaults.video_model !== res.settings.default_models.video_model
      ) {
        const res2 = await api<{ settings: AdminRoutingSettings }>("/api/admin/settings/routing", {
          method: "PATCH",
          body: JSON.stringify({
            default_models: nextDefaults,
          }),
        });
        setData(res2.settings);
      } else {
        setData(res.settings);
      }

      if (arkKey || volcDraft.imageModel || volcDraft.videoModel) {
        await api("/api/admin/settings/models", {
          method: "PATCH",
          body: JSON.stringify({
            ark_api_key: arkKey || undefined,
            ark_base_url: ARK_BASE,
            model_image: volcDraft.imageModel || undefined,
            model_image_45: volcDraft.image45Model || undefined,
            model_video: volcDraft.videoModel || undefined,
          }),
        });
      }

      setApiKeyInputs({});
      await load();
      toast.success("路由配置已保存");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !data) {
    return <SettingsLoading label="加载路由配置…" />;
  }

  return (
    <SettingsTabShell onSave={() => void handleSave()} saving={saving} saveLabel="保存路由">
      {(data?.validation_errors.length ?? 0) > 0 ? (
        <SettingsSurface className="border-[#fde2e2] bg-[#fef0f0]">
          <div className="text-xs font-medium text-[#f56c6c]">配置校验</div>
          <ul className="mt-1 space-y-0.5 text-xs text-[#f56c6c]">
            {data?.validation_errors.map((item) => (
              <li key={item}>· {item}</li>
            ))}
          </ul>
        </SettingsSurface>
      ) : null}

      <ArkVolcMediaPanel
        channelId={ARK_VOLC_CHANNEL_ID}
        hasApiKey={Boolean(arkVolcChannel?.has_api_key)}
        apiKeyInput={apiKeyInputs[ARK_VOLC_CHANNEL_ID] ?? ""}
        onApiKeyChange={(value) => setApiKeyInputs((prev) => ({ ...prev, [ARK_VOLC_CHANNEL_ID]: value }))}
        draft={volcDraft}
        onDraftChange={(patch) => setVolcDraft((prev) => ({ ...prev, ...patch }))}
      />

      {!hasVideoChannel ? (
        <SettingsSurface className="border-[#faecd8] bg-[#fdf6ec]">
          <div className="text-xs font-medium text-[#e6a23c]">请在上方选择默认视频模型并保存</div>
        </SettingsSurface>
      ) : null}

      <SettingsPanel
        className="settings-panel--compact"
        title="其他上游渠道"
        description="文本 LLM、语音 TTS 等"
      >
        <div className="mb-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            className="admin-quick-btn !inline-flex !w-auto !flex-row items-center gap-1.5 px-3 py-1.5 text-xs"
            onClick={() => addPreset("text")}
          >
            <Type className="h-3.5 w-3.5" />
            添加文本渠道
          </button>
          <button
            type="button"
            className="admin-quick-btn !inline-flex !w-auto !flex-row items-center gap-1.5 px-3 py-1.5 text-xs"
            onClick={() => addPreset("audio")}
          >
            <Mic className="h-3.5 w-3.5" />
            添加语音渠道
          </button>
          <button
            type="button"
            className="rounded-lg border border-dashed border-[#dcdfe6] px-3 py-1.5 text-xs text-[#606266] hover:border-[#67c23a]"
            onClick={addChannel}
          >
            <Plus className="mr-1 inline h-3.5 w-3.5" />
            空白渠道
          </button>
        </div>

        <div className="grid gap-2 xl:grid-cols-[200px_minmax(0,1fr)]">
          <div className="space-y-1.5">
            {otherChannels.map((channel) => {
              const caps = channelCapabilities(channel);
              return (
                <button
                  key={channel.id}
                  type="button"
                  className={cn(
                    "w-full rounded-lg border px-2.5 py-1.5 text-left text-sm transition-colors",
                    selectedChannel?.id === channel.id
                      ? "border-[#67c23a] bg-[#f0f9eb]"
                      : "border-[#ebeef5] bg-white hover:border-[#dcdfe6]",
                  )}
                  onClick={() => setSelectedChannelId(channel.id)}
                >
                  <div className="font-medium text-[#303133]">{channel.name}</div>
                  <div className="mt-0.5 truncate font-mono text-[11px] text-[#909399]">{channel.id}</div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {caps.map((cap) => (
                      <span
                        key={cap}
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[10px]",
                          cap === "video"
                            ? "bg-[#ecf5ff] text-[#409eff]"
                            : cap === "image"
                              ? "bg-[#f0f9eb] text-[#67c23a]"
                              : cap === "audio"
                                ? "bg-[#fdf6ec] text-[#e6a23c]"
                                : "bg-[#f4f4f5] text-[#909399]",
                        )}
                      >
                        {CAPABILITY_LABELS[cap]}
                      </span>
                    ))}
                    {!channel.enabled ? (
                      <span className="rounded bg-[#fef0f0] px-1.5 py-0.5 text-[10px] text-[#f56c6c]">停用</span>
                    ) : null}
                    {channel.has_api_key ? (
                      <span className="rounded bg-[#f4f4f5] px-1.5 py-0.5 text-[10px] text-[#909399]">已有 Key</span>
                    ) : (
                      <span className="rounded bg-[#fef0f0] px-1.5 py-0.5 text-[10px] text-[#f56c6c]">缺 Key</span>
                    )}
                  </div>
                </button>
              );
            })}
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
              {channelCapabilities(selectedChannel).includes("video") ? (
                <div className="mb-3 rounded-lg border border-[#d9ecff] bg-[#ecf5ff] px-3 py-2 text-xs text-[#409eff]">
                  当前为视频相关渠道：协议请保持 ARK，上游模型需含 seedance（如{" "}
                  <span className="font-mono">{DEFAULT_VIDEO_MODEL}</span>），并填写方舟 API Key。
                </div>
              ) : null}
              <div className="settings-field-grid">
                <LabeledControl label="名称">
                  <input
                    className="settings-input"
                    value={selectedChannel.name}
                    onChange={(e) => updateChannel(selectedChannel.id, { name: e.target.value })}
                  />
                </LabeledControl>
                <LabeledControl label="启用">
                  <select
                    className="settings-select"
                    value={selectedChannel.enabled ? "1" : "0"}
                    onChange={(e) =>
                      updateChannel(selectedChannel.id, { enabled: e.target.value === "1" })
                    }
                  >
                    <option value="1">启用</option>
                    <option value="0">停用</option>
                  </select>
                </LabeledControl>
                <LabeledControl label="Base URL">
                  <input
                    className="settings-input"
                    value={selectedChannel.base_url}
                    onChange={(e) => updateChannel(selectedChannel.id, { base_url: e.target.value })}
                    placeholder={ARK_BASE}
                  />
                </LabeledControl>
                <LabeledControl label="协议" hint="视频必须选 ARK">
                  <select
                    className="settings-select"
                    value={selectedChannel.protocol}
                    onChange={(e) =>
                      updateChannel(selectedChannel.id, {
                        protocol: e.target.value as AdminRoutingSettings["system_channels"][number]["protocol"],
                        api_format:
                          e.target.value === "ark"
                            ? "ark"
                            : selectedChannel.api_format === "ark"
                              ? "openai"
                              : selectedChannel.api_format,
                      })
                    }
                  >
                    <option value="auto">自动</option>
                    <option value="openai">OpenAI（仅文本）</option>
                    <option value="ark">ARK（生图/视频）</option>
                    <option value="volc_tts">豆包 TTS</option>
                  </select>
                </LabeledControl>
                <LabeledControl
                  label="API Key"
                  hint={selectedChannel.has_api_key ? "已保存，留空不修改" : "视频请填火山方舟 Key"}
                >
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
                <LabeledControl
                  className="settings-field-span-full"
                  label="上游模型（每行一个）"
                  hint="视频示例：doubao-seedance-2-5-260628"
                >
                  <textarea
                    className="settings-input min-h-[96px] py-2 font-mono text-xs"
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

      <SettingsPanel
        className="settings-panel--compact"
        title="逻辑模型"
        description="保存渠道后自动同步"
      >
        <div className="space-y-3">
          {(["video", "image", "text", "audio"] as const).map((cap) => {
            const models = (data?.logical_models ?? []).filter((m) => m.capability === cap);
            if (models.length === 0 && cap !== "video") return null;
            return (
              <div key={cap}>
                <div className="mb-2 text-xs font-medium text-[#909399]">
                  {CAPABILITY_LABELS[cap]}
                  {cap === "video" && models.length === 0 ? " · 暂无，请先添加并保存视频渠道" : ""}
                </div>
                {models.length === 0 && cap === "video" ? (
                  <SettingsSurface className="text-xs text-[#909399]">
                    保存含 Seedance 的 ARK 渠道后，这里会出现视频逻辑模型。
                  </SettingsSurface>
                ) : (
                  <div className="space-y-3">
                    {models.map((model) => (
                      <SettingsSurface key={model.id}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="text-sm font-medium text-[#303133]">{model.name || model.id}</div>
                            <div className="font-mono text-[11px] text-[#909399]">
                              {model.id} · {CAPABILITY_LABELS[model.capability]}
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
                                const channel = data?.system_channels.find(
                                  (item) => item.id === binding.channel_id,
                                );
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
                )}
              </div>
            );
          })}
        </div>
      </SettingsPanel>

      <SettingsPanel className="settings-panel--compact" title="默认模型" description="各能力默认逻辑模型">
        <div className="settings-field-grid settings-field-grid--4">
          {(["text_model", "image_model", "video_model", "audio_model"] as const).map((key) => {
            const cap = key.replace("_model", "") as Capability;
            const options = (data?.logical_models ?? []).filter((model) => model.capability === cap);
            return (
              <LabeledControl key={key} label={CAPABILITY_LABELS[cap] + "默认"}>
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
                  {options.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name || model.id}
                    </option>
                  ))}
                </select>
                {key === "video_model" && options.length === 0 ? (
                  <div className="mt-1 text-[11px] text-[#e6a23c]">
                    无视频逻辑模型（当前 {videoLogicalModels.length} 个）— 请添加视频渠道并保存
                  </div>
                ) : null}
              </LabeledControl>
            );
          })}
        </div>
      </SettingsPanel>
    </SettingsTabShell>
  );
}
