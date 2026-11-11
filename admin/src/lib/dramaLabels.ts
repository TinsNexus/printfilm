import { tr } from "../i18n/translate.ts";
/** 漫剧资产生成状态（与 params.generation.status 一致） */
export const DRAMA_GENERATION_STATUSES = [
  "queued",
  "running",
  "generating",
  "done",
  "failed",
  "cancelled",
] as const;

/** 漫剧生成状态中文标签（idle 仅用于分镜等无 params.generation 时的展示回退） */
export function dramaGenerationStatusLabel(status: string): string {
  const map: Record<string, string> = {
    queued: tr("dramaUi.gen.queued"),
    running: tr("dramaUi.gen.running"),
    generating: tr("dramaUi.gen.running"),
    done: tr("dramaUi.gen.done"),
    failed: tr("dramaUi.gen.failed"),
    cancelled: tr("dramaUi.gen.cancelled"),
    idle: tr("dramaUi.gen.idle"),
  };
  return map[status] ?? status;
}

/** 列表/详情展示：空值显示 — */
export function formatDramaGenerationStatus(status: string | null | undefined): string {
  if (!status) return "—";
  return dramaGenerationStatusLabel(status);
}

/** 漫剧资产类型中文标签 */
export function dramaAssetTypeLabel(type: string): string {
  const map: Record<string, string> = {
    character: tr("dramaUi.asset.character"),
    scene: tr("dramaUi.asset.scene"),
    prop: tr("dramaUi.asset.prop"),
    material: tr("dramaUi.asset.material"),
    narration: tr("dramaUi.asset.narration"),
    get video() { return tr("dramaUi.asset.video"); },
    audio: tr("dramaUi.asset.audio"),
    text: tr("dramaUi.asset.text"),
    none: tr("dramaUi.asset.none"),
  };
  return map[type] ?? type;
}
