import { Activity, Film, Percent, TrendingUp } from "lucide-react";
import type { AdminStats } from "@/api/client";
import { fenToYuan } from "@/lib/utils";
import { dashboardRangeLabel, type DashboardFilterState } from "@/pages/dashboard/DashboardFilters";
import { DashboardKpiCard } from "@/pages/dashboard/DashboardKpiCard";
import { calcProfitFen, sumDailyUsage } from "@/pages/dashboard/dashboardMetrics";
import { useI18n } from "@/i18n";

type DashboardPeriodKpisProps = {
  stats: AdminStats | null;
  filters: DashboardFilterState;
  loading: boolean;
};

/** 第二行 KPI：随筛选时间窗变化的调用/扣费/毛利/项目规模 */
export function DashboardPeriodKpis({ stats, filters, loading }: DashboardPeriodKpisProps) {
  const { t: tx } = useI18n();
  const placeholder = loading ? "…" : "—";
  const rangeLabel = dashboardRangeLabel(filters.days);
  const period = sumDailyUsage(stats?.daily_usage ?? []);
  const profitFen = calcProfitFen(period.charge_fen, period.cost_fen);
  const profitPct =
    period.charge_fen > 0 ? `${((profitFen / period.charge_fen) * 100).toFixed(1)}%` : undefined;

  return (
    <div className="admin-dashboard-kpi-grid admin-dashboard-kpi-grid--secondary">
      <DashboardKpiCard
        label={tx("periodKpis.calls", { rangeLabel })}
        value={stats ? period.calls.toLocaleString() : placeholder}
        hint={stats ? tx("periodKpis.cumulative", { n: stats.usage_calls_total ?? 0 }) : tx("periodKpis.calls2")}
        icon={Activity}
        tone="mint"
      />
      <DashboardKpiCard
        label={tx("periodKpis.charges", { rangeLabel })}
        value={stats ? `¥${fenToYuan(period.charge_fen)}` : placeholder}
        hint={stats ? tx("periodKpis.monthAmount", { amount: fenToYuan(stats.usage_charge_month_fen ?? 0) }) : tx("periodKpis.userCharges")}
        icon={TrendingUp}
        tone="blue"
      />
      <DashboardKpiCard
        label={tx("periodKpis.grossProfit", { rangeLabel })}
        value={stats ? `¥${fenToYuan(profitFen)}` : placeholder}
        hint={stats ? tx("periodKpis.costAmount", { amount: fenToYuan(period.cost_fen) }) : tx("periodKpis.chargesMinusCost")}
        icon={Percent}
        tone="rose"
        trend={profitPct ? tx("periodKpis.grossMargin", { profitPct }) : undefined}
      />
      <DashboardKpiCard
        label={tx("periodKpis.dramaProjects")}
        value={stats ? stats.drama_project_count ?? 0 : placeholder}
        hint={stats ? tx("periodKpis.users", { statsUser_count: stats.user_count }) : tx("periodKpis.projectScale")}
        icon={Film}
        tone="slate"
      />
    </div>
  );
}
