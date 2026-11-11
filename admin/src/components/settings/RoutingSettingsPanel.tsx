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
  CAPABILITY_LABELS,
  CAPABILITY_ORDER,
  detectDefaultRemaps,
  PRESET_MODELS,
  setActivePresetGateway,
  type ModelCapability,
} from "@/lib/tokenfreeRecommendedModels";
import { enabledPresetModels, normalizeRoutingDefaults, routingModelSettings, setRoutingModelEnabled } from "@/lib/routingModels";
import { cn } from "@/lib/utils";

const TOKENFREE_CHANNEL_ID = "tokenfree";
const TOKENFREE_BASE_URL = "https://www.tokenfree.com/v1";
const TOKENFREE_CONSOLE_URL = "https://www.tokenfree.com/channels";

const DEFAULT_KEYS = ["text_model", "image_model", "video_model", "audio_model"] as const;
const MEDIA_FIELDS = ["images", "videos", "audios"] as const;
type MediaField = (typeof MEDIA_FIELDS)[number];
const MEDIA_LABELS: Record<MediaField, string> = { images: "Ảnh tham chiếu", videos: "Video tham chiếu", audios: "Âm thanh tham chiếu" };

function buildReadiness(data: AdminRoutingSettings | null, hasKey: boolean) {
  const defaults = data?.default_models;
  return [
    { id: "secret", label: "API Key", ready: hasKey },
    { id: "text", label: "Model văn bản", ready: Boolean(defaults?.text_model) },
    { id: "image", label: "Model hình ảnh", ready: Boolean(defaults?.image_model) },
    { id: "video", label: "Model video", ready: Boolean(defaults?.video_model) },
    { id: "audio", label: "Model lồng tiếng", ready: Boolean(defaults?.audio_model) },
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
      toast.error(err instanceof Error ? err.message : "Tải cấu hình model thất bại");
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
        referenceErrors[id] = { ...referenceErrors[id], [field]: "Vui lòng nhập số nguyên từ 0–100" };
      }
    });
  });
  const referenceErrorCount = Object.values(referenceErrors).reduce((total, fields) => total + Object.keys(fields).length, 0);
  const keyError = hasKey ? undefined : "Vui lòng nhập API Key, lưu xong là có thể gọi model.";

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
      toast.success("Đã lưu cấu hình model");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !data) {
    return <SettingsLoading label="Đang tải cấu hình model…" />;
  }

  if (!data) return <SettingsSurface><p>Tải cấu hình model thất bại.</p><button type="button" className="admin-btn admin-btn-secondary mt-3" onClick={() => void load()}>Tải lại</button></SettingsSurface>;

  return (
    <SettingsTabShell onSave={handleSave} saving={saving} disabled={Boolean(keyError) || referenceErrorCount > 0} saveLabel="Lưu cài đặt model">
      <SettingsSurface className="settings-readiness-bar">
        <div className="settings-readiness-title">Cấu hình sẵn sàng</div>
        <div className="settings-readiness-row">
          {readiness.map((item) => (
            <div key={item.id} className={cn("settings-readiness-item", item.ready && "is-ready")}>
              <span className={cn("settings-readiness-dot", item.ready ? "is-on" : "is-off")} />
              <span>{item.label}</span>
              <em>{item.ready ? "Đã cấu hình" : "Chưa sẵn sàng"}</em>
            </div>
          ))}
        </div>
      </SettingsSurface>

      {(data?.validation_errors.length ?? 0) > 0 ? (
        <SettingsSurface className="border-[#fde2e2] bg-[#fef0f0]">
          <div className="text-xs font-medium text-[#f56c6c]">Kiểm tra cấu hình</div>
          <ul className="mt-1 space-y-0.5 text-xs text-[#f56c6c]">
            {data?.validation_errors.map((item) => (
              <li key={item}>· {item}</li>
            ))}
          </ul>
        </SettingsSurface>
      ) : null}

      {defaultRemaps.length > 0 ? (
        <SettingsSurface className="border-[#faecd8] bg-[#fdf6ec]">
          <div className="text-xs font-medium text-[#e6a23c]">Model mặc định đã được ánh xạ sang preset</div>
          <ul className="mt-1 space-y-0.5 text-xs text-[#b88230]">
            {defaultRemaps.map((item) => (
              <li key={`${item.capability}-${item.from}`}>
                · {CAPABILITY_LABELS[item.capability]}：
                <code className="mx-1">{item.from}</code>→
                <code className="mx-1">{item.to}</code>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-[#909399]">Sau khi lưu sẽ ghi các id preset ở trên; nếu cần giữ model cũ, hãy đổi danh sách thả xuống trước rồi lưu.</p>
        </SettingsSurface>
      ) : null}

      <GatewaySwitchPanel onChanged={() => void load()} />

      <SettingsPanel title="Kết nối dịch vụ model" description="Dùng TokenFree API Key để kết nối upstream. Địa chỉ giao diện đã được đặt sẵn, hoàn tất ủy quyền rồi chọn model mặc định.">
        <LabeledControl label="TokenFree API Key" required={!hasSavedKey} optional={hasSavedKey} error={keyError}
          hint={hasSavedKey ? "Đã lưu khóa. Để trống sẽ giữ giá trị cũ; nhập khóa mới sẽ thay thế sau khi lưu." : "Tạo khóa trong bảng điều khiển TokenFree và dán vào đây."}>
          <div className="settings-secret-row">
            <input className="settings-input is-secret" type={showKey ? "text" : "password"}
              autoComplete="new-password" autoCapitalize="off" spellCheck={false}
              required={!hasSavedKey} aria-invalid={Boolean(keyError)}
              placeholder={hasSavedKey ? "Đã lưu, để trống giữ khóa hiện tại" : "Dán API Key"}
              value={apiKeyInput} onChange={(e) => setApiKeyInput(e.target.value)} />
            <button type="button" className="admin-btn admin-btn-secondary settings-mini-btn" aria-label={showKey ? "Ẩn API Key" : "Hiện API Key"} aria-pressed={showKey} onClick={() => setShowKey((value) => !value)}>
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
            {apiKeyInput ? <button type="button" className="admin-btn admin-btn-secondary settings-mini-btn" onClick={() => { setApiKeyInput(""); setShowKey(false); }}>Hủy phần đã nhập</button> : null}
          </div>
        </LabeledControl>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--admin-muted)]">
          <span>Địa chỉ kết nối <code className="ml-1 text-[var(--admin-text)]">{TOKENFREE_BASE_URL}</code></span>
          <a className="inline-flex items-center gap-1.5 font-medium text-[var(--admin-forest)] hover:underline" href={TOKENFREE_CONSOLE_URL} target="_blank" rel="noreferrer">Mở bảng điều khiển TokenFree<ExternalLink className="h-3.5 w-3.5" /></a>
        </div>
      </SettingsPanel>

      <SettingsPanel title="Sử dụng model và mặc định" description="Bật các model cho phép người dùng dùng, rồi chọn model mặc định của site. Sau khi lưu, model bị tắt sẽ không còn dùng cho yêu cầu mới; các tác vụ hình/video đã cố định route vẫn tiếp tục chạy.">
        <div className="settings-field-grid settings-field-grid--2">
          {CAPABILITY_ORDER.map((cap) => {
            const key = `${cap}_model` as (typeof DEFAULT_KEYS)[number];
            const options = enabledPresetModels(cap, data.logical_models);
            const hints: Record<ModelCapability, string> = { text: "Dùng cho kịch bản, tóm tắt và lập kế hoạch phân cảnh.", image: "Dùng để tạo ảnh tham chiếu cho nhân vật, bối cảnh, đạo cụ, v.v.", video: "Dùng để tạo video phân cảnh.", audio: "Dùng cho lồng tiếng nhân vật; hiện cung cấp một model preset." };
            return (
              <section key={cap} className="min-w-0 space-y-4 rounded-xl border border-[var(--admin-border)] p-4" aria-label={`${CAPABILITY_LABELS[cap]}Cài đặt sử dụng model`}>
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-sm font-semibold">{CAPABILITY_LABELS[cap]}Model</h4>
                  <span className="text-xs text-[var(--admin-muted)]">Đã bật {options.length} / {PRESET_MODELS[cap].length}</span>
                </div>
                <p className="text-xs text-[var(--admin-muted)]">{hints[cap]}</p>
                <div className="space-y-2">
                  {PRESET_MODELS[cap].map((row) => {
                    const model = data.logical_models.find((item) => item.capability === cap && item.id === row.id);
                    const enabled = Boolean(model?.enabled);
                    return <div key={row.id} className="settings-toggle-row">
                      <div className="min-w-0"><strong>{row.label}</strong><span className="block break-all">{row.id}</span></div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span>{enabled ? "Đã bật" : "Đã tắt"}</span>
                        <Switch aria-label={`${row.label} Sử dụng`} checked={enabled} disabled={!model}
                          onCheckedChange={(value) => setData((prev) => prev ? setRoutingModelEnabled(prev, row.id, value) : prev)} />
                      </div>
                    </div>;
                  })}
                </div>
                <LabeledControl label={`${CAPABILITY_LABELS[cap]}Model mặc định`} required={options.length > 0}
                  hint={options.length === 0 ? "Hiện không có model khả dụng, hãy bật model trước khi dùng chức năng này." : "Chỉ chọn trong các model đã bật."}>
                  <Select className="settings-select" value={data.default_models[key]} required={options.length > 0} disabled={options.length === 0}
                    aria-label={`${CAPABILITY_LABELS[cap]}Model mặc định`} onChange={(e) => setDefaultModel(key, e.target.value)}>
                    {options.length === 0 ? <option value="">Không có model khả dụng</option> : options.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                  </Select>
                </LabeledControl>
              </section>
            );
          })}
        </div>
      </SettingsPanel>

      <details className="settings-advanced">
        <summary><span>Cài đặt model nâng cao</span><span>{referenceErrorCount > 0 ? `${referenceErrorCount} mục giới hạn tham chiếu cần sửa` : "Cấu hình số lượng tài liệu tham chiếu theo model"}</span></summary>
        <SettingsPanel title="Giới hạn tài liệu tham chiếu" description="Giới hạn số ảnh, video và âm thanh tham chiếu có thể đính kèm cho mỗi lần tạo. Mỗi mục là số nguyên 0–100, 0 nghĩa là không hỗ trợ; khung đầu cuối và bảng phong cách cũng tính vào số ảnh.">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b text-xs text-[var(--admin-muted)]">
                <th scope="col" className="px-2 py-3 font-medium">Model</th>
                <th scope="col" className="px-2 py-3 font-medium">Ảnh / tấm</th>
                <th scope="col" className="px-2 py-3 font-medium">Video / đoạn</th>
                <th scope="col" className="px-2 py-3 font-medium">Âm thanh / đoạn</th>
              </tr></thead>
              <tbody>{Object.entries(data.media_reference_limits ?? {}).map(([id, limits]) => (
                <tr key={id} className="border-b last:border-0">
                  <th scope="row" className="px-2 py-3 font-medium">{[...PRESET_MODELS.image, ...PRESET_MODELS.video].find((model) => model.id === id)?.label ?? id}<code className="mt-1 block text-[10px] font-normal text-[var(--admin-muted)]">{id}</code></th>
                  {MEDIA_FIELDS.map((field) => {
                    const unsupported = PRESET_MODELS.image.some((model) => model.id === id) && field !== "images";
                    const error = referenceErrors[id]?.[field];
                    return <td key={field} className="px-2 py-3 align-top">
                      {unsupported ? <span className="inline-flex h-10 items-center text-xs text-[var(--admin-muted)]">Không hỗ trợ</span> : <>
                        <input type="number" min="0" max="100" step="1" required
                          aria-label={`${id} ${MEDIA_LABELS[field]}Giới hạn`} aria-invalid={Boolean(error)}
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
          <p className="mt-4 text-xs leading-6 text-[var(--admin-muted)]">Các giá trị này dùng để kiểm tra số lượng trước khi gửi tác vụ. Model tạo ảnh chỉ nhận tham chiếu ảnh; năng lực thực tế tùy theo model upstream tương ứng.</p>
        </SettingsPanel>
      </details>
    </SettingsTabShell>
  );
}
