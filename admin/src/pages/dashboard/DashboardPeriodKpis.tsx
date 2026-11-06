import { Activity, Film, TrendingUp } from "lucide-react";
import type { AdminStats } from "@/api/client";
import { fenToYuan } from "@/lib/utils";
import { dashboardRangeLabel, type DashboardFilterState } from "@/pages/dashboard/DashboardFilters";
import { DashboardKpiCard } from "@/pages/dashboard/DashboardKpiCard";
import { sumDailyUsage } from "@/pages/dashboard/dashboardMetrics";

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
        label={`${rangeLabel}Lượt gọi`}
        value={stats ? period.calls.toLocaleString() : placeholder}
        hint={stats ? `Tổng ${stats.usage_calls_total ?? 0} lần` : "Số lần gọi"}
        icon={Activity}
        tone="mint"
      />
      <DashboardKpiCard
        label={`${rangeLabel}Trừ phí`}
        value={stats ? `¥${fenToYuan(period.charge_fen)}` : placeholder}
        hint={stats ? `Tháng này ¥${fenToYuan(stats.usage_charge_month_fen ?? 0)}` : "Phí trừ người dùng"}
        icon={TrendingUp}
        tone="blue"
      />
      <DashboardKpiCard
        label="Dự án phim truyện"
        value={stats ? stats.drama_project_count ?? 0 : placeholder}
        hint={stats ? `Người dùng ${stats.user_count}` : "Quy mô dự án"}
        icon={Film}
        tone="slate"
      />
    </div>
  );
}
