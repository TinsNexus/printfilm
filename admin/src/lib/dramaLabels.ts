import { tr } from "@/i18n/translate";
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
    get queued() { return tr("status.queued") },
    get running() { return tr("status.generating") },
    get generating() { return tr("status.generating") },
    get done() { return tr("status.done") },
    get failed() { return tr("status.failed") },
    get cancelled() { return tr("status.cancelled") },
    get idle() { return tr("status.started") },
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
    get character() { return tr("status.character") },
    get scene() { return tr("status.scene") },
    get prop() { return tr("status.prop") },
    get material() { return tr("status.material") },
    get narration() { return tr("status.narration") },
    get video() { return tr("status.video") },
    get audio() { return tr("status.audio") },
    get text() { return tr("status.text") },
    get none() { return tr("status.uncategorized") },
  };
  return map[type] ?? type;
}
