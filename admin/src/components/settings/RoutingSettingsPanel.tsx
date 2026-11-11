import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { api, type AdminRoutingSettings } from "@/api/client";
import { GatewaySwitchPanel } from "@/components/settings/GatewaySwitchPanel";
import {
  LabeledControl,
  SettingsLoading,
  SettingsPanel,
  SettingsSurface,
  SettingsTabShell,
} from "@/components/settings/SettingsPanel";
import {
  allPresetChannelModels,
  CAPABILITY_ORDER,
  detectDefaultRemaps,
  PRESET_MODELS,
  setActivePresetGateway,
  type ModelCapability,
} from "@/lib/tokenfreeRecommendedModels";
import { enabledPresetModels, normalizeRoutingDefaults, routingModelSettings, setRoutingModelEnabled } from "@/lib/routingModels";
import { cn } from "@/lib/utils";
import { tr } from "@/i18n";

const TOKENFREE_CHANNEL_ID = "tokenfree";
const TOKENFREE_BASE_URL = "https://www.tokenfree.com/v1";
const TOKENFREE_CONSOLE_URL = "https://www.tokenfree.com/channels";

const DEFAULT_KEYS = ["text_model", "image_model", "video_model", "audio_model"] as const;
const MEDIA_FIELDS = ["images", "videos", "audios"] as const;
type MediaField = (typeof MEDIA_FIELDS)[number];
// 能力名（按当前语言；放组件侧，保持 lib 不依赖 i18n，便于 node 单测）
function capabilityLabel(cap: ModelCapability): string {
  return tr(`routing.cap.${cap}`);
}

// 参考素材类型名（函数而非常量：渲染时按当前语言取）
function mediaLabel(field: MediaField): string {
  return tr(`routing.media.${field}`);
}

function buildReadiness(data: AdminRoutingSettings | null, hasKey: boolean) {
  const defaults = data?.default_models;
  return [
    { id: "secret", label: "API Key", ready: hasKey },
    { id: "text", label: tr("routing.textModel"), ready: Boolean(defaults?.text_model) },
    { id: "image", label: tr("routing.imageModel"), ready: Boolean(defaults?.image_model) },
    { id: "video", label: tr("routing.videoModel"), ready: Boolean(defaults?.video_model) },
    { id: "audio", label: tr("routing.voiceModel"), ready: Boolean(defaults?.audio_model) },
  ] as const;
}

// 模型启停与站点默认值共同保存，保留上游绑定与策略。
export function RoutingSettingsPanel() {
  const [data, setData] = useState<AdminRoutingSettings | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [referenceDrafts, setReferenceDrafts] = useState<Record<string, Partial<Record<MediaField, string>>>>({});
  const [defaultRemaps, setDefaultRemaps] = useState<
    Array<{ capability: ModelCapability; from: string; to: string }>
  >([]);

  const channel = data?.system_channels.find((item) => item.id === TOKENFREE_CHANNEL_ID) ?? data?.system_channels[0];
  const hasSavedKey = Boolean(channel?.has_api_key);
  const hasKey = hasSavedKey || Boolean(apiKeyInput.trim());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<AdminRoutingSettings>("/api/admin/settings/routing");
      // 先按当前上游（TokenFree / PiAPI）切换预设，再归一默认模型
      setActivePresetGateway(res.gateway_type);
      const defaults = normalizeRoutingDefaults(res.default_models, res.logical_models);
      setDefaultRemaps(detectDefaultRemaps(res.default_models)
        .map((item) => ({ ...item, to: defaults[`${item.capability}_model`] }))
        .filter((item) => Boolean(item.to)));
      setData({
        ...res,
        default_models: defaults,
        system_channels: res.system_channels.map((item) =>
          item.id === TOKENFREE_CHANNEL_ID
            ? { ...item, models: allPresetChannelModels() }
            : item,
        ),
      });
      setApiKeyInput("");
      setReferenceDrafts({});
      setShowKey(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("routing.couldLoadModelSettings"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const readiness = buildReadiness(data, hasKey);
  const referenceErrors: Record<string, Partial<Record<MediaField, string>>> = {};
  Object.entries(data?.media_reference_limits ?? {}).forEach(([id, limits]) => {
    MEDIA_FIELDS.forEach((field) => {
      if (PRESET_MODELS.image.some((model) => model.id === id) && field !== "images") return;
      const raw = referenceDrafts[id]?.[field] ?? String(limits[field]);
      const value = Number(raw);
      if (!raw.trim() || !Number.isInteger(value) || value < 0 || value > 100) {
        referenceErrors[id] = { ...referenceErrors[id], [field]: tr("routing.limitIntegerRange") };
      }
    });
  });
  const referenceErrorCount = Object.values(referenceErrors).reduce((total, fields) => total + Object.keys(fields).length, 0);
  const keyError = hasKey ? undefined : tr("routing.apiKeyRequired");

  function setDefaultModel(key: (typeof DEFAULT_KEYS)[number], value: string) {
    const cap = key.replace("_model", "") as ModelCapability;
    setData((prev) =>
      prev
        ? {
            ...prev,
            default_models: { ...prev.default_models, [key]: enabledPresetModels(cap, prev.logical_models).find((model) => model.id === value)?.id ?? "" },
          }
        : prev,
    );
  }

  async function handleSave() {
    if (!data || saving || keyError || referenceErrorCount > 0) return;
    setSaving(true);
    try {
      const res = await api<{ settings: AdminRoutingSettings }>("/api/admin/settings/routing", {
        method: "PATCH",
        body: JSON.stringify({
          system_channels: [
            {
              id: TOKENFREE_CHANNEL_ID,
              name: "TokenFree New API",
              base_url: TOKENFREE_BASE_URL,
              api_key: apiKeyInput.trim() || undefined,
              api_format: "openai",
              protocol: "auto",
              models: allPresetChannelModels(),
              enabled: true,
              sort_order: 0,
            },
          ],
          ...routingModelSettings(data),
        }),
      });
      setActivePresetGateway(res.settings.gateway_type);
      setData({
        ...res.settings,
        default_models: normalizeRoutingDefaults(res.settings.default_models, res.settings.logical_models),
      });
      setDefaultRemaps([]);
      setApiKeyInput("");
      setReferenceDrafts({});
      setShowKey(false);
      toast.success(tr("routing.modelSettingsSaved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("routing.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  if (loading && !data) {
    return <SettingsLoading label={tr("routing.loadingModelSettings")} />;
  }

  if (!data) return <SettingsSurface><p>{tr("routing.loadFailedFull")}</p><button type="button" className="admin-btn admin-btn-secondary mt-3" onClick={() => void load()}>{tr("routing.reload")}</button></SettingsSurface>;

  return (
    <SettingsTabShell onSave={handleSave} saving={saving} disabled={Boolean(keyError) || referenceErrorCount > 0} saveLabel={tr("routing.saveModelSettings")}>
      <SettingsSurface className="settings-readiness-bar">
        <div className="settings-readiness-title">{tr("routing.configurationReady")}</div>
        <div className="settings-readiness-row">
          {readiness.map((item) => (
            <div key={item.id} className={cn("settings-readiness-item", item.ready && "is-ready")}>
              <span className={cn("settings-readiness-dot", item.ready ? "is-on" : "is-off")} />
              <span>{item.label}</span>
              <em>{item.ready ? tr("routing.configured") : tr("routing.notReady")}</em>
            </div>
          ))}
        </div>
      </SettingsSurface>

      {(data?.validation_errors.length ?? 0) > 0 ? (
        <SettingsSurface className="border-[#fde2e2] bg-[#fef0f0]">
          <div className="text-xs font-medium text-[#f56c6c]">{tr("routing.configurationChecks")}</div>
          <ul className="mt-1 space-y-0.5 text-xs text-[#f56c6c]">
            {data?.validation_errors.map((item) => (
              <li key={item}>· {item}</li>
            ))}
          </ul>
        </SettingsSurface>
      ) : null}

      {defaultRemaps.length > 0 ? (
        <SettingsSurface className="border-[#faecd8] bg-[#fdf6ec]">
          <div className="text-xs font-medium text-[#e6a23c]">{tr("routing.defaultsRemapped")}</div>
          <ul className="mt-1 space-y-0.5 text-xs text-[#b88230]">
            {defaultRemaps.map((item) => (
              <li key={`${item.capability}-${item.from}`}>
                · {capabilityLabel(item.capability)}：
                <code className="mx-1">{item.from}</code>→
                <code className="mx-1">{item.to}</code>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-[#909399]">{tr("routing.defaultsRemappedHint")}</p>
        </SettingsSurface>
      ) : null}

      <GatewaySwitchPanel onChanged={() => void load()} />

      <SettingsPanel title={tr("routing.connectTitle")} description={tr("routing.connectDesc")}>
        <LabeledControl label="TokenFree API Key" required={!hasSavedKey} optional={hasSavedKey} error={keyError}
          hint={hasSavedKey ? tr("routing.keySavedHint") : tr("routing.keyCreateHint")}>
          <div className="settings-secret-row">
            <input className="settings-input is-secret" type={showKey ? "text" : "password"}
              autoComplete="new-password" autoCapitalize="off" spellCheck={false}
              required={!hasSavedKey} aria-invalid={Boolean(keyError)}
              placeholder={hasSavedKey ? tr("routing.keySavedPlaceholder") : tr("routing.pasteApiKey")}
              value={apiKeyInput} onChange={(e) => setApiKeyInput(e.target.value)} />
            <button type="button" className="admin-btn admin-btn-secondary settings-mini-btn" aria-label={showKey ? tr("routing.hideApiKey") : tr("routing.showApiKey")} aria-pressed={showKey} onClick={() => setShowKey((value) => !value)}>
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
            {apiKeyInput ? <button type="button" className="admin-btn admin-btn-secondary settings-mini-btn" onClick={() => { setApiKeyInput(""); setShowKey(false); }}>{tr("routing.discardInput")}</button> : null}
          </div>
        </LabeledControl>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--admin-muted)]">
          <span>{tr("routing.endpoint")} <code className="ml-1 text-[var(--admin-text)]">{TOKENFREE_BASE_URL}</code></span>
          <a className="inline-flex items-center gap-1.5 font-medium text-[var(--admin-forest)] hover:underline" href={TOKENFREE_CONSOLE_URL} target="_blank" rel="noreferrer">{tr("routing.openTokenfreeConsole")}<ExternalLink className="h-3.5 w-3.5" /></a>
        </div>
      </SettingsPanel>

      <SettingsPanel title={tr("routing.usageTitle")} description={tr("routing.usageDesc")}>
        <div className="settings-field-grid settings-field-grid--2">
          {CAPABILITY_ORDER.map((cap) => {
            const key = `${cap}_model` as (typeof DEFAULT_KEYS)[number];
            const options = enabledPresetModels(cap, data.logical_models);
            const hints: Record<ModelCapability, string> = { text: tr("routing.hintText"), image: tr("routing.hintImage"), video: tr("routing.hintVideo"), audio: tr("routing.hintAudio") };
            return (
              <section key={cap} className="min-w-0 space-y-4 rounded-xl border border-[var(--admin-border)] p-4" aria-label={tr("routing.capUsageAria", { cap: capabilityLabel(cap) })}>
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-sm font-semibold">{tr("routing.capModels", { cap: capabilityLabel(cap) })}</h4>
                  <span className="text-xs text-[var(--admin-muted)]">{tr("routing.enabledCount", { n: options.length, total: PRESET_MODELS[cap].length })}</span>
                </div>
                <p className="text-xs text-[var(--admin-muted)]">{hints[cap]}</p>
                <div className="space-y-2">
                  {PRESET_MODELS[cap].map((row) => {
                    const model = data.logical_models.find((item) => item.capability === cap && item.id === row.id);
                    const enabled = Boolean(model?.enabled);
                    return <div key={row.id} className="settings-toggle-row">
                      <div className="min-w-0"><strong>{row.label}</strong><span className="block break-all">{row.id}</span></div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span>{enabled ? tr("routing.enabled") : tr("routing.disabled")}</span>
                        <Switch aria-label={tr("routing.useModelAria", { model: row.label })} checked={enabled} disabled={!model}
                          onCheckedChange={(value) => setData((prev) => prev ? setRoutingModelEnabled(prev, row.id, value) : prev)} />
                      </div>
                    </div>;
                  })}
                </div>
                <LabeledControl label={tr("routing.capDefault", { cap: capabilityLabel(cap) })} required={options.length > 0}
                  hint={options.length === 0 ? tr("routing.noModelHint") : tr("routing.enabledOnlyHint")}>
                  <Select className="settings-select" value={data.default_models[key]} required={options.length > 0} disabled={options.length === 0}
                    aria-label={tr("routing.capDefault", { cap: capabilityLabel(cap) })} onChange={(e) => setDefaultModel(key, e.target.value)}>
                    {options.length === 0 ? <option value="">{tr("routing.noModel")}</option> : options.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                  </Select>
                </LabeledControl>
              </section>
            );
          })}
        </div>
      </SettingsPanel>

      <details className="settings-advanced">
        <summary><span>{tr("routing.advancedTitle")}</span><span>{referenceErrorCount > 0 ? tr("routing.refErrors", { n: referenceErrorCount }) : tr("routing.advancedSummary")}</span></summary>
        <SettingsPanel title={tr("routing.refLimitsTitle")} description={tr("routing.refLimitsDesc")}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b text-xs text-[var(--admin-muted)]">
                <th scope="col" className="px-2 py-3 font-medium">{tr("routing.colModel")}</th>
                <th scope="col" className="px-2 py-3 font-medium">{tr("routing.colImages")}</th>
                <th scope="col" className="px-2 py-3 font-medium">{tr("routing.colVideos")}</th>
                <th scope="col" className="px-2 py-3 font-medium">{tr("routing.colAudios")}</th>
              </tr></thead>
              <tbody>{Object.entries(data.media_reference_limits ?? {}).map(([id, limits]) => (
                <tr key={id} className="border-b last:border-0">
                  <th scope="row" className="px-2 py-3 font-medium">{[...PRESET_MODELS.image, ...PRESET_MODELS.video].find((model) => model.id === id)?.label ?? id}<code className="mt-1 block text-[10px] font-normal text-[var(--admin-muted)]">{id}</code></th>
                  {MEDIA_FIELDS.map((field) => {
                    const unsupported = PRESET_MODELS.image.some((model) => model.id === id) && field !== "images";
                    const error = referenceErrors[id]?.[field];
                    return <td key={field} className="px-2 py-3 align-top">
                      {unsupported ? <span className="inline-flex h-10 items-center text-xs text-[var(--admin-muted)]">{tr("routing.unsupported")}</span> : <>
                        <input type="number" min="0" max="100" step="1" required
                          aria-label={tr("routing.refLimitAria", { model: id, media: mediaLabel(field) })} aria-invalid={Boolean(error)}
                          className="settings-input !w-24" value={referenceDrafts[id]?.[field] ?? limits[field]} disabled={saving}
                          onChange={(event) => {
                            const raw = event.target.value;
                            setReferenceDrafts((prev) => ({ ...prev, [id]: { ...prev[id], [field]: raw } }));
                            const value = Number(raw);
                            if (!raw.trim() || !Number.isInteger(value) || value < 0 || value > 100) return;
                            setData((prev) => prev ? { ...prev, media_reference_limits: { ...prev.media_reference_limits,
                              [id]: { ...prev.media_reference_limits[id], [field]: value } } } : prev);
                          }} />
                        {error ? <p className="mt-1 text-[11px] text-[#b64d43]" role="alert">{error}</p> : null}
                      </>}
                    </td>;
                  })}
                </tr>
              ))}</tbody>
            </table>
          </div>
          <p className="mt-4 text-xs leading-6 text-[var(--admin-muted)]">{tr("routing.refLimitsFoot")}</p>
        </SettingsPanel>
      </details>
    </SettingsTabShell>
  );
}
