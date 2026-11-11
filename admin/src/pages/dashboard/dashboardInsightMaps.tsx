import {
  Clapperboard,
  Film,
  Image,
  MessageSquareText,
  Mic,
  Palette,
  Video,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { AdminUsageBucket } from "@/api/client";
import type { DashboardMetric } from "@/pages/dashboard/DashboardFilters";
import type { DashboardInsightItem, DashboardInsightTone } from "@/pages/dashboard/DashboardInsightGrid";
import { formatDashboardMetric, readBucketMetric } from "@/pages/dashboard/dashboardMetrics";
import { tr } from "../../i18n/translate.ts";

const CAPABILITY_META: Record<string, { label: string; icon: LucideIcon; tone: DashboardInsightTone }> = {
  llm: { get label() { return tr("dashUi.cap.llm"); }, icon: MessageSquareText, tone: "purple" },
  image: { get label() { return tr("dashUi.cap.image"); }, icon: Image, tone: "blue" },
  video: { get label() { return tr("dashUi.cap.video"); }, icon: Video, tone: "teal" },
  tts: { get label() { return tr("dashUi.cap.tts"); }, icon: Mic, tone: "sand" },
  unknown: { get label() { return tr("dashUi.cap.other"); }, icon: Wrench, tone: "slate" },
};

const DOMAIN_META: Record<string, { label: string; icon: LucideIcon; tone: DashboardInsightTone }> = {
  drama: { get label() { return tr("dashUi.domain.drama"); }, icon: Film, tone: "teal" },
  kepu: { get label() { return tr("dashUi.domain.kepu"); }, icon: Clapperboard, tone: "blue" },
  tools: { get label() { return tr("dashUi.domain.tools"); }, icon: Wrench, tone: "sand" },
  studio: { get label() { return tr("dashUi.domain.studio"); }, icon: Palette, tone: "mint" },
  unknown: { get label() { return tr("dashUi.cap.other"); }, icon: Wrench, tone: "slate" },
};

function buildInsightItems(
  rows: AdminUsageBucket[],
  metric: DashboardMetric,
  metaMap: Record<string, { label: string; icon: LucideIcon; tone: DashboardInsightTone }>,
  labelForKey?: (key: string) => string,
): DashboardInsightItem[] {
  const prepared = [...rows]
    .map((row) => ({
      row,
      value: readBucketMetric(row, metric),
    }))
    .filter((item) => item.value > 0);
  const total = prepared.reduce((sum, item) => sum + item.value, 0);

  return prepared
    .sort((a, b) => b.value - a.value)
    .map(({ row, value }) => {
      const meta = metaMap[row.key] ?? metaMap.unknown;
      const sharePct = total > 0 ? ((value / total) * 100).toFixed(1) : null;
      const shareHint = sharePct ? tr("dashUi.share", { pct: sharePct }) : undefined;
      return {
        key: row.key,
        label: labelForKey?.(row.key) ?? meta.label,
        value: formatDashboardMetric(value, metric),
        hint: [shareHint, tr("dashUi.callsN", { n: row.calls.toLocaleString() })].filter(Boolean).join(" · "),
        icon: meta.icon,
        tone: meta.tone,
      };
    });
}

/** 能力分布洞察卡片 */
export function buildCapabilityInsights(
  rows: AdminUsageBucket[],
  metric: DashboardMetric,
): DashboardInsightItem[] {
  return buildInsightItems(rows, metric, CAPABILITY_META);
}

/** 领域分布洞察卡片 */
export function buildDomainInsights(
  rows: AdminUsageBucket[],
  metric: DashboardMetric,
  labelForKey: (key: string) => string,
): DashboardInsightItem[] {
  return buildInsightItems(rows, metric, DOMAIN_META, labelForKey);
}
