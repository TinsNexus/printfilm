import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  Banknote,
  Clapperboard,
  Film,
  Layers,
  Receipt,
  Settings,
  Shapes,
  Users,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { PageSection } from "@/components/admin/PageSection";
import { PageHeader } from "@/components/ui/page";
import { api, type AdminOrder, type AdminStats, type PageMeta } from "@/api/client";
import { AdminEntityLink } from "@/components/admin/AdminEntityLink";
import { fenToYuan } from "@/lib/utils";
import { projectStatusLabel, taskDomainLabel } from "@/lib/statusLabels";
import {
  buildStatsQuery,
  dashboardRangeLabel,
  DashboardFilters,
  DEFAULT_DASHBOARD_FILTERS,
  PROJECTS_DASHBOARD_FILTERS,
  type DashboardFilterState,
} from "@/pages/dashboard/DashboardFilters";
import { DashboardKpiCard } from "@/pages/dashboard/DashboardKpiCard";
import { DashboardInsightGrid } from "@/pages/dashboard/DashboardInsightGrid";
import { DashboardPeriodKpis } from "@/pages/dashboard/DashboardPeriodKpis";
import { DashboardSectionTabs, type DashboardSection } from "@/pages/dashboard/DashboardSectionTabs";
import { buildDomainInsights } from "@/pages/dashboard/dashboardInsightMaps";
import { buildFinanceInsights, buildProjectInsights } from "@/pages/dashboard/dashboardSectionInsights";
import { sumDailyUsage } from "@/pages/dashboard/dashboardMetrics";
import { UsageDistributionChart } from "@/pages/dashboard/UsageDistributionChart";
import { TopUsersRankingChart } from "@/pages/dashboard/TopUsersRankingChart";
import { UsageTrendChart } from "@/pages/dashboard/UsageTrendChart";

type OrderRes = { items: AdminOrder[]; meta: PageMeta };

const CAPABILITY_LABELS: Record<string, string> = {
  llm: "LLM văn bản",
  image: "Tạo ảnh",
  video: "Video",
  tts: "Lồng tiếng",
  unknown: "Khác",
  other: "Khác",
};

function statusClass(status: string): string {
  if (status === "DONE") return "is-done";
  if (status === "FAILED" || status === "REJECTED" || status === "CANCELLED") return "is-fail";
  if (status === "SCRIPTING" || status === "IMAGING" || status === "VIDEOING" || status === "COMPOSING") {
    return "is-run";
  }
  return "is-warn";
}

function capabilityLabel(key: string): string {
  return CAPABILITY_LABELS[key] ?? key;
}

function domainChartLabel(key: string): string {
  if (key === "kepu") return "Video ngắn AI";
  return taskDomainLabel(key);
}

/** 管理端仪表盘：板块切换 + 渐变 KPI + 可筛选用量图表 */
export function DashboardPage() {
  const [section, setSection] = useState<DashboardSection>("overview");
  const [filters, setFilters] = useState<DashboardFilterState>(DEFAULT_DASHBOARD_FILTERS);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async (nextFilters: DashboardFilterState) => {
    setLoading(true);
    try {
      const [s, o] = await Promise.all([
        api<AdminStats>(buildStatsQuery(nextFilters)),
        api<OrderRes>("/api/admin/orders?page=1&page_size=8&status=paid"),
      ]);
      setStats(s);
      setOrders(o.items);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Tải thất bại");
    } finally {
      setLoading(false);
    }
  }, []);

  const kpiReady = Boolean(stats);
  const kpiPlaceholder = loading ? "…" : "—";
  const statsFilters = section === "projects" ? PROJECTS_DASHBOARD_FILTERS : filters;
  const projectsRangeLabel = dashboardRangeLabel(PROJECTS_DASHBOARD_FILTERS.days);

  useEffect(() => {
    void loadData(statsFilters);
  }, [statsFilters, loadData]);

  const statusEntries = Object.entries(stats?.project_status_counts ?? {}).sort((a, b) => b[1] - a[1]);
  const daily = stats?.daily_usage ?? [];
  const byCapability = stats?.usage_by_capability ?? [];
  const byDomain = stats?.usage_by_domain ?? [];
  const topUsers = stats?.top_users_by_charge ?? [];
  const rangeLabel = dashboardRangeLabel(filters.days);
  const showUsageFilters = section === "overview" || section === "usage";
  const domainInsights = buildDomainInsights(byDomain, filters.metric, domainChartLabel);
  const financeInsights = buildFinanceInsights(stats);
  const projectInsights = buildProjectInsights(stats, sumDailyUsage(daily));
  const metricHint = filters.metric === "calls" ? "Số lần gọi" : "Số tiền trừ";

  return (
    <div className="admin-page admin-dashboard-page">
      <PageHeader title="Tổng quan vận hành" description="Tổng quan người dùng, nạp tiền, lượt gọi AI và chi phí" />

      <div className="admin-dashboard-kpi-grid">
        <DashboardKpiCard
          label="Tổng số người dùng"
          value={kpiReady ? stats!.user_count : kpiPlaceholder}
          hint="Tổng người dùng đăng ký"
          icon={Users}
          tone="teal"
        />
        <DashboardKpiCard
          label="Tổng đã thanh toán"
          value={kpiReady ? `¥${fenToYuan(stats!.order_paid_total_fen)}` : kpiPlaceholder}
          hint="Nạp tiền lịch sử"
          icon={Banknote}
          tone="blue"
        />
        <DashboardKpiCard
          label="Phí AI tháng này"
          value={kpiReady ? `¥${fenToYuan(stats!.usage_charge_month_fen ?? 0)}` : kpiPlaceholder}
          hint={kpiReady ? `Hôm nay ¥${fenToYuan(stats!.usage_charge_today_fen ?? 0)}` : "Phí trừ hôm nay"}
          icon={Zap}
          tone="purple"
        />
        <DashboardKpiCard
          label="Lượt gọi tháng này"
          value={kpiReady ? (stats!.usage_calls_month ?? 0).toLocaleString() : kpiPlaceholder}
          hint={kpiReady ? `Hôm nay ${(stats!.usage_calls_today ?? 0).toLocaleString()} lần` : "Số lần gọi"}
          icon={Activity}
          tone="sand"
        />
      </div>

      <DashboardSectionTabs value={section} onChange={setSection} />

      {showUsageFilters ? <DashboardFilters value={filters} onChange={setFilters} /> : null}
      {showUsageFilters ? <DashboardPeriodKpis stats={stats} filters={filters} loading={loading} /> : null}

      {section === "overview" ? (
        <>
          <div className="admin-dashboard-charts">
            <PageSection
              title={`${rangeLabel}Xu hướng mức dùng`}
              description={loading ? "Đang tải…" : "Xu hướng theo ngày tổng hợp theo điều kiện lọc"}
              bodyClassName="!pt-2"
              className="admin-dashboard-chart-main admin-dashboard-glass min-h-0"
            >
              <UsageTrendChart data={daily} metric={filters.metric} />
            </PageSection>

            <PageSection
              title="Phân bố năng lực"
              description={`${rangeLabel} · ${metricHint}`}
              bodyClassName="!pt-2"
              className="admin-dashboard-chart-side admin-dashboard-glass min-h-0"
            >
              <UsageDistributionChart
                data={byCapability}
                metric={filters.metric}
                labelForKey={capabilityLabel}
                variant="donut"
              />
            </PageSection>
          </div>

          <PageSection
            title={`TOP3 chi tiêu người dùng (${rangeLabel}）`}
            actions={
              <Link to="/orders?tab=usage" className="admin-link">
                Xem thêm →
              </Link>
            }
            bodyClassName="!pt-2"
            className="admin-dashboard-glass min-h-0"
          >
            <TopUsersRankingChart users={topUsers.slice(0, 3)} metric={filters.metric} />
          </PageSection>

          <div className="admin-dashboard-charts">
            <PageSection
              title="Phân bố lĩnh vực"
              description={`${rangeLabel} · ${metricHint}`}
              bodyClassName="!pt-2"
              className="admin-dashboard-chart-main admin-dashboard-glass min-h-0"
            >
              <UsageDistributionChart
                data={byDomain}
                metric={filters.metric}
                labelForKey={domainChartLabel}
                variant="bar"
              />
            </PageSection>
            <PageSection
              title="Thông tin lĩnh vực"
              description={`${rangeLabel} · ${metricHint}`}
              bodyClassName="!pt-2"
              className="admin-dashboard-chart-side admin-dashboard-glass min-h-0"
            >
              <DashboardInsightGrid items={domainInsights} columns={2} />
            </PageSection>
          </div>
        </>
      ) : null}

      {section === "usage" ? (
        <>
          <div className="admin-dashboard-charts">
            <PageSection
              title={`${rangeLabel}Xu hướng mức dùng`}
              description={loading ? "Đang tải…" : "Phí trừ / lượt gọi tổng hợp theo ngày"}
              bodyClassName="!pt-2"
              className="admin-dashboard-chart-main admin-dashboard-glass min-h-0"
            >
              <UsageTrendChart data={daily} metric={filters.metric} />
            </PageSection>

            <PageSection
              title="Phân bố năng lực"
              description={`${rangeLabel} · ${metricHint}`}
              bodyClassName="!pt-2"
              className="admin-dashboard-chart-side admin-dashboard-glass min-h-0"
            >
              <UsageDistributionChart
                data={byCapability}
                metric={filters.metric}
                labelForKey={capabilityLabel}
                variant="donut"
              />
            </PageSection>
          </div>

          <div className="admin-dashboard-charts">
            <PageSection
              title="Phân bố lĩnh vực"
              description={`${rangeLabel} · ${metricHint}`}
              bodyClassName="!pt-2"
              className="admin-dashboard-chart-main admin-dashboard-glass min-h-0"
            >
              <UsageDistributionChart
                data={byDomain}
                metric={filters.metric}
                labelForKey={domainChartLabel}
                variant="bar"
              />
            </PageSection>
            <PageSection
              title={`Xếp hạng chi tiêu người dùng (${rangeLabel}）`}
              actions={
                <Link to="/orders?tab=usage" className="admin-link">
                  Chi tiết mức dùng →
                </Link>
              }
              description={metricHint}
              bodyClassName="!pt-2"
              className="admin-dashboard-chart-side admin-dashboard-glass min-h-0"
            >
              <TopUsersRankingChart users={topUsers} metric={filters.metric} />
            </PageSection>
          </div>
        </>
      ) : null}

      {section === "finance" ? (
        <div className="admin-dashboard-body admin-dashboard-body--finance">
          <PageSection
            title="Tổng quan tài chính"
            description="Nạp tiền và phí trừ người dùng"
            actions={
              <Link to="/finance" className="admin-link">
                Danh sách tài chính →
              </Link>
            }
            bodyClassName="!pt-2"
            className="admin-dashboard-glass min-h-0 admin-dashboard-body--full"
          >
            <DashboardInsightGrid items={financeInsights} columns={3} />
          </PageSection>

          <PageSection
            title="Đơn hàng gần đây"
            description="Chỉ hiển thị thanh toán thành công"
            actions={
              <Link to="/orders" className="admin-link">
                Tất cả →
              </Link>
            }
            bodyClassName="!pt-0"
            className="admin-dashboard-glass min-h-0 admin-dashboard-body--full"
          >
            <div className="admin-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Tên người dùng</th>
                    <th>Số tiền</th>
                    <th>Thời gian thanh toán</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="!text-center text-[var(--admin-muted)]">
                        Chưa có đơn hàng đã thanh toán
                      </td>
                    </tr>
                  ) : (
                    orders.map((o) => (
                      <tr key={o.id}>
                        <td>
                          <AdminEntityLink kind="user" id={o.user_id} label={o.user_email ?? undefined} />
                        </td>
                        <td className="font-semibold text-[var(--admin-forest)]">¥{fenToYuan(o.amount_fen)}</td>
                        <td className="text-xs text-[var(--admin-muted)]">
                          {o.paid_at ? new Date(o.paid_at).toLocaleString() : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </PageSection>
        </div>
      ) : null}

      {section === "projects" ? (
        <>
          <PageSection
            title="Tổng quan vận hành hệ thống"
            description="Quy mô dự án, lượt gọi và phân bố trạng thái"
            bodyClassName="!pt-2"
            className="admin-dashboard-glass min-h-0"
          >
            <DashboardInsightGrid items={projectInsights} columns={4} />
          </PageSection>

          <div className="admin-dashboard-project-row">
            <PageSection
              title="Trạng thái dự án video ngắn AI"
              description={`Dự án phim truyện ${stats?.drama_project_count ?? 0} bộ`}
              bodyClassName="!pt-2"
              className="admin-dashboard-glass min-h-0"
            >
              <div className="flex flex-wrap gap-1.5">
                {statusEntries.length === 0 ? (
                  <span className="text-xs text-[var(--admin-muted)]">Chưa có dữ liệu</span>
                ) : (
                  statusEntries.map(([status, count]) => (
                    <span key={status} className={`admin-status-pill !px-2.5 !py-1 !text-[11px] ${statusClass(status)}`}>
                      {projectStatusLabel(status)} {count}
                    </span>
                  ))
                )}
              </div>
            </PageSection>

            <PageSection title="Thống kê lượt gọi" bodyClassName="!pt-2" className="admin-dashboard-glass min-h-0">
              <div className="admin-dashboard-stat-grid">
                <div>
                  <div className="admin-dashboard-stat-grid-label">Lượt gọi hôm nay</div>
                  <div className="admin-dashboard-stat-grid-value">
                    {kpiReady ? stats!.usage_calls_today ?? 0 : kpiPlaceholder}
                  </div>
                </div>
                <div>
                  <div className="admin-dashboard-stat-grid-label">Lượt gọi tháng này</div>
                  <div className="admin-dashboard-stat-grid-value">
                    {kpiReady ? stats!.usage_calls_month ?? 0 : kpiPlaceholder}
                  </div>
                </div>
                <div>
                  <div className="admin-dashboard-stat-grid-label">Tổng lượt gọi</div>
                  <div className="admin-dashboard-stat-grid-value">
                    {kpiReady ? stats!.usage_calls_total ?? 0 : kpiPlaceholder}
                  </div>
                </div>
              </div>
            </PageSection>
          </div>

          <PageSection title={`Phân bố lĩnh vực (${projectsRangeLabel}）`} bodyClassName="!pt-2" className="admin-dashboard-glass min-h-0">
            <UsageDistributionChart
              data={byDomain}
              metric="charge"
              labelForKey={domainChartLabel}
              variant="bar"
            />
          </PageSection>

          <PageSection title="Lối tắt" bodyClassName="!pt-2" className="admin-dashboard-glass">
            <div className="admin-dashboard-tools">
              <Link to="/templates" className="admin-dashboard-tool-btn">
                <Shapes className="h-5 w-5" />
                <span>Quản lý mẫu</span>
              </Link>
              <Link to="/orders?tab=usage" className="admin-dashboard-tool-btn">
                <Receipt className="h-5 w-5" />
                <span>Mức dùng đơn hàng</span>
              </Link>
              <Link to="/users" className="admin-dashboard-tool-btn">
                <Users className="h-5 w-5" />
                <span>Quản lý người dùng</span>
              </Link>
              <Link to="/projects" className="admin-dashboard-tool-btn">
                <Clapperboard className="h-5 w-5" />
                <span>Video ngắn AI</span>
              </Link>
              <Link to="/drama-projects" className="admin-dashboard-tool-btn">
                <Film className="h-5 w-5" />
                <span>Dự án phim truyện</span>
              </Link>
              <Link to="/queues" className="admin-dashboard-tool-btn">
                <Layers className="h-5 w-5" />
                <span>Hàng đợi tác vụ</span>
              </Link>
              <Link to="/settings" className="admin-dashboard-tool-btn">
                <Settings className="h-5 w-5" />
                <span>Cấu hình hệ thống</span>
              </Link>
              <Link to="/orders" className="admin-dashboard-tool-btn">
                <Activity className="h-5 w-5" />
                <span>Biến động tài chính</span>
              </Link>
            </div>
          </PageSection>
        </>
      ) : null}
    </div>
  );
}
