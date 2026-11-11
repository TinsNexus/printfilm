export type ModelCapability = "text" | "image" | "video" | "audio";

export type PresetModelOption = { id: string; label: string };

/** 预设所属上游：未标 gateways 的属于 TokenFree / 9Router；PiAPI 只用标了 piapi 的 */
type GatewayPresetOption = PresetModelOption & { gateways?: readonly PresetGateway[] };
export type PresetGateway = "tokenfree" | "piapi";

/** 与后端 media_model_presets.PRESET_MODELS 对齐（含各上游专属预设） */
const ALL_PRESET_MODELS: Record<ModelCapability, GatewayPresetOption[]> = {
  text: [
    { id: "kimi-k2.6", label: "Kimi K2.6" },
    { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
    { id: "gpt-5.5", label: "GPT 5.5" },
    { id: "gpt-4o", label: "GPT-4o", gateways: ["piapi"] },
    { id: "gpt-5", label: "GPT-5", gateways: ["piapi"] },
    { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", gateways: ["piapi"] },
  ],
  image: [
    { id: "seedream-5.0-pro", label: "Seedream 5.0 Pro" },
    { id: "seedream-5.0", label: "Seedream 5.0" },
    { id: "seedream-5.0-flash", label: "Seedream 5.0 Flash" },
    { id: "gpt-image-2", label: "GPT Image 2" },
    { id: "gpt-image-2.5", label: "GPT Image 2.5" },
    { id: "flux1-dev", label: "Flux.1 Dev", gateways: ["piapi"] },
    { id: "flux1-schnell", label: "Flux.1 Schnell", gateways: ["piapi"] },
  ],
  video: [
    { id: "seedance-2.5", label: "Seedance 2.5", gateways: ["tokenfree", "piapi"] },
    { id: "seedance-2.0", label: "Seedance 2.0" },
    { id: "seedance-2.0-fast", label: "Seedance 2.0 Fast" },
    // mini：TokenFree→Ark 未开通，暂不下发
    { id: "MiniMax-H3", label: "MiniMax H3" },
    { id: "kling-3.0", label: "Kling 3.0", gateways: ["piapi"] },
    { id: "kling-4.0", label: "Kling 4.0", gateways: ["piapi"] },
    { id: "veo3.1", label: "Veo 3.1", gateways: ["piapi"] },
    { id: "veo3.1-fast", label: "Veo 3.1 Fast", gateways: ["piapi"] },
  ],
  audio: [{ id: "qwen-tts-2025-05-22", label: "Qwen TTS" }],
};

/** 某上游可用的预设（9Router 与 TokenFree 共用一套） */
function presetsFor(gateway: PresetGateway): Record<ModelCapability, PresetModelOption[]> {
  const pick = (rows: GatewayPresetOption[]) =>
    rows.filter((row) => (row.gateways ?? ["tokenfree"]).includes(gateway)).map(({ id, label }) => ({ id, label }));
  return {
    text: pick(ALL_PRESET_MODELS.text),
    image: pick(ALL_PRESET_MODELS.image),
    video: pick(ALL_PRESET_MODELS.video),
    audio: pick(ALL_PRESET_MODELS.audio),
  };
}

/** 当前上游下的预设；默认 TokenFree，切到 PiAPI 时由 setActivePresetGateway 原地替换 */
export const PRESET_MODELS: Record<ModelCapability, PresetModelOption[]> = presetsFor("tokenfree");

/**
 * 按后台当前上游刷新 PRESET_MODELS（原地替换各数组，已有引用自动生效）。
 * @param gatewayType 路由设置返回的 gateway_type；piapi 以外一律按 TokenFree 预设
 */
export function setActivePresetGateway(gatewayType: string | null | undefined): void {
  const next = presetsFor(gatewayType === "piapi" ? "piapi" : "tokenfree");
  for (const cap of Object.keys(next) as ModelCapability[]) {
    PRESET_MODELS[cap].splice(0, PRESET_MODELS[cap].length, ...next[cap]);
  }
}

export const CAPABILITY_ORDER: ModelCapability[] = ["text", "image", "video", "audio"];

/** 写入网关渠道的全部预设 id（含各上游专属预设，与后端 all_preset_channel_models 一致） */
export function allPresetChannelModels(): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const cap of CAPABILITY_ORDER) {
    for (const row of ALL_PRESET_MODELS[cap]) {
      const id = (row.id || "").trim();
      if (!id || seen.has(id.toLowerCase())) continue;
      seen.add(id.toLowerCase());
      out.push(id);
    }
  }
  return out;
}

/** 历史友好别名 → 预设规范 id（与后端 PRESET_MODEL_ALIASES 对齐） */
const PRESET_MODEL_ALIASES: Record<string, string> = {
  "seedance-2-5": "seedance-2.5",
  "seedance2.5": "seedance-2.5",
  "seedance-2": "seedance-2.0",
  seedance2: "seedance-2.0",
  "seedance-2-0": "seedance-2.0",
  "seedance2.0": "seedance-2.0",
  "seedance-2-0-mini": "seedance-2.0",
  "seedance-2.0-mini": "seedance-2.0",
  "doubao-seedance-2-0-mini-260615": "seedance-2.0",
  "seedance-2-0-fast": "seedance-2.0-fast",
  "seedream-5-0-pro": "seedream-5.0-pro",
  "seedream-5-0": "seedream-5.0",
  "seedream-5": "seedream-5.0",
  "seedream5.0": "seedream-5.0",
  seedream5: "seedream-5.0",
  "seedream-5-0-flash": "seedream-5.0-flash",
  "gpt-image-2-5": "gpt-image-2.5",
  "gpt-image-2.5": "gpt-image-2.5",
  "gpt-image-2.5-sunburst": "gpt-image-2.5",
  "gpt-image-2-5-sunburst": "gpt-image-2.5",
  "gpt-image-2.5-flare": "gpt-image-2.5",
  "gpt-image-2-5-flare": "gpt-image-2.5",
  "gemini-3.1-flash-tts": "qwen-tts-2025-05-22",
};

function resolvePresetAlias(modelId: string): string {
  const key = modelId.trim().toLowerCase().replace(/\s+/g, "");
  for (const [alias, canonical] of Object.entries(PRESET_MODEL_ALIASES)) {
    if (alias.toLowerCase().replace(/\s+/g, "") === key) return canonical;
  }
  return modelId.trim();
}

/** 非法或不空缺省时落到该能力第一项 */
export function clampDefaultToPreset(cap: ModelCapability, modelId: string | null | undefined): string {
  const raw = resolvePresetAlias(modelId || "");
  const opts = PRESET_MODELS[cap];
  const hit = opts.find((row) => row.id.toLowerCase() === raw.toLowerCase());
  if (hit) return hit.id;
  return opts[0]?.id || "";
}

/** 加载时检测「历史默认值被钳到预设」以便提示管理员确认 */
export function detectDefaultRemaps(
  raw: Partial<Record<`${ModelCapability}_model`, string>> | null | undefined,
): Array<{ capability: ModelCapability; from: string; to: string }> {
  const out: Array<{ capability: ModelCapability; from: string; to: string }> = [];
  for (const cap of CAPABILITY_ORDER) {
    const key = `${cap}_model` as `${ModelCapability}_model`;
    const original = String(raw?.[key] || "").trim();
    if (!original) continue;
    const clamped = clampDefaultToPreset(cap, original);
    if (original.toLowerCase() === clamped.toLowerCase()) continue;
    if (resolvePresetAlias(original).toLowerCase() === clamped.toLowerCase()) continue;
    out.push({ capability: cap, from: original, to: clamped });
  }
  return out;
}

/** 默认站点默认值（四类各取第一项） */
export function defaultPresetDefaults(): Record<`${ModelCapability}_model`, string> {
  return {
    text_model: clampDefaultToPreset("text", ""),
    image_model: clampDefaultToPreset("image", ""),
    video_model: clampDefaultToPreset("video", ""),
    audio_model: clampDefaultToPreset("audio", ""),
  };
}
