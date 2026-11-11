import { points } from "@/lib/points";
import {
  Activity,
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  Clapperboard,
  Film,
  Layers,
  TrendingDown,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { AdminStats } from "@/api/client";
import type { DashboardInsightItem } from "@/pages/dashboard/DashboardInsightGrid";
import { sumDailyUsage, sumProjectStatuses } from "@/pages/dashboard/dashboardMetrics";
import { fenToYuan } from "@/lib/utils";
import { projectStatusLabel } from "@/lib/statusLabels";
import { tr } from "../../i18n/translate.ts";

/** 财务账单 Tab 图标指标 */
export function buildFinanceInsights(stats: AdminStats | null): DashboardInsightItem[] {
  if (!stats) return [];

  const monthCharge = stats.usage_charge_month_fen ?? 0;

  return [
    {
      key: "paid-total",
      label: tr("dashUi.totalTopup"),
      value: `¥${fenToYuan(stats.order_paid_total_fen)}`,
      hint: tr("dashUi.todayAmount", { amount: `¥${fenToYuan(stats.order_paid_today_fen)}` }),
      icon: Banknote,
      tone: "blue",
    },
    {
      key: "charge-month",
      label: tr("dashUi.chargeMonth"),
      value: `¥${fenToYuan(monthCharge)}`,
      hint: tr("dashUi.todayAmount", { amount: points(stats.usage_charge_today_fen ?? 0) }),
      icon: Zap,
      tone: "purple",
    },
    {
      key: "paid-today",
      label: tr("dashUi.creditedToday"),
      value: `¥${fenToYuan(stats.order_paid_today_fen)}`,
      hint: tr("dashUi.topupOrders"),
      icon: CircleDollarSign,
      tone: "teal",
    },
  ];
}

const STATUS_META: Record<string, { icon: LucideIcon; tone: DashboardInsightItem["tone"] }> = {
  DONE: { icon: CheckCircle2, tone: "mint" },
  DRAFT: { icon: Layers, tone: "slate" },
  FAILED: { icon: TrendingDown, tone: "rose" },
  SCRIPTING: { icon: Clapperboard, tone: "blue" },
  IMAGING: { icon: Film, tone: "purple" },
  VIDEOING: { icon: Activity, tone: "teal" },
};

/** 项目运维 Tab 图标指标 */
export function buildProjectInsights(stats: AdminStats | null, periodDaily: ReturnType<typeof sumDailyUsage>): DashboardInsightItem[] {
  if (!stats) return [];

  const kepuTotal = sumProjectStatuses(stats.project_status_counts);
  const items: DashboardInsightItem[] = [
    {
      key: "kepu-total",
      label: tr("layout.explainerProjects"),
      value: kepuTotal,
      hint: tr("dashUi.dramaN", { n: stats.drama_project_count ?? 0 }),
      icon: Clapperboard,
      tone: "blue",
    },
    {
      key: "drama-total",
      label: tr("layout.dramaProjects"),
      value: stats.drama_project_count ?? 0,
      hint: tr("dashUi.siteProjects"),
      icon: Film,
      tone: "teal",
    },
    {
      key: "calls-today",
      label: tr("dashUi.callsToday"),
      value: (stats.usage_calls_today ?? 0).toLocaleString(),
      hint: tr("dashUi.monthCallsN", { n: stats.usage_calls_month ?? 0 }),
      icon: Activity,
      tone: "mint",
    },
    {
      key: "calls-total",
      label: tr("dashUi.callsTotal"),
      value: (stats.usage_calls_total ?? 0).toLocaleString(),
      hint: tr("dashUi.windowCallsN", { n: periodDaily.calls.toLocaleString() }),
      icon: Layers,
      tone: "slate",
    },
  ];

  const statusEntries = Object.entries(stats.project_status_counts ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  for (const [status, count] of statusEntries) {
    const meta = STATUS_META[status] ?? { icon: Layers, tone: "sand" as const };
    items.push({
      key: `status-${status}`,
      label: projectStatusLabel(status),
      value: count,
      hint: kepuTotal > 0 ? tr("dashUi.shareOfKepu", { pct: ((count / kepuTotal) * 100).toFixed(1) }) : undefined,
      icon: meta.icon,
      tone: meta.tone,
    });
  }

  return items;
}
