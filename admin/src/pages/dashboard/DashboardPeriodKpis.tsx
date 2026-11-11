import { Activity, Film, TrendingUp } from "lucide-react";
import type { AdminStats } from "@/api/client";
import { points } from "@/lib/points";
import { dashboardRangeLabel, type DashboardFilterState } from "@/pages/dashboard/DashboardFilters";
import { DashboardKpiCard } from "@/pages/dashboard/DashboardKpiCard";
import { sumDailyUsage } from "@/pages/dashboard/dashboardMetrics";
import { tr } from "../../i18n/translate.ts";

type DashboardPeriodKpisProps = {
  stats: AdminStats | null;
  filters: DashboardFilterState;
  loading: boolean;
};

/** 第二行 KPI：随筛选时间窗变化的调用/扣费及项目规模 */
export function DashboardPeriodKpis({ stats, filters, loading }: DashboardPeriodKpisProps) {
  const placeholder = loading ? "…" : "—";
  const rangeLabel = dashboardRangeLabel(filters.days);
  const period = sumDailyUsage(stats?.daily_usage ?? []);

  return (
    <div className="admin-dashboard-kpi-grid admin-dashboard-kpi-grid--secondary min-[1401px]:!grid-cols-3">
      <DashboardKpiCard
        label={tr("dashUi.rangeCalls", { range: rangeLabel })}
        value={stats ? period.calls.toLocaleString() : placeholder}
        hint={stats ? tr("dashUi.totalCallsN", { n: stats.usage_calls_total ?? 0 }) : tr("dashUi.metricCalls")}
        icon={Activity}
        tone="mint"
      />
      <DashboardKpiCard
        label={tr("dashUi.rangeCharge", { range: rangeLabel })}
        value={stats ? `${points(period.charge_fen)}` : placeholder}
        hint={stats ? tr("dashUi.monthAmount", { amount: points(stats.usage_charge_month_fen ?? 0) }) : tr("dashUi.userCharges")}
        icon={TrendingUp}
        tone="blue"
      />
      <DashboardKpiCard
        label={tr("layout.dramaProjects")}
        value={stats ? stats.drama_project_count ?? 0 : placeholder}
        hint={stats ? tr("dashUi.usersN", { n: stats.user_count }) : tr("dashUi.projectScale")}
        icon={Film}
        tone="slate"
      />
    </div>
  );
}
