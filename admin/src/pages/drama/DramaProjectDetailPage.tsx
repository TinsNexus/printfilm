import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { api, type AdminDramaProject } from "@/api/client";
import {
  AdminDetailMeta,
  AdminDetailSection,
  AdminDetailStatGrid,
  AdminDetailTableWrap,
} from "@/components/admin/AdminDetailLayout";
import { AdminEntityLink } from "@/components/admin/AdminEntityLink";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { dramaAssetTypeLabel, formatDramaGenerationStatus } from "@/lib/dramaLabels";
import { taskStatusLabel, taskTypeLabel } from "@/lib/statusLabels";
import { points } from "@/lib/points";

const TABS = ["overview", "episodes", "assets", "tasks"] as const;
type TabKey = (typeof TABS)[number];

function isTabKey(value: string | null): value is TabKey {
  return TABS.includes(value as TabKey);
}

/** 漫剧项目二级详情：概览 / 分集 / 资产 / 任务 */
export function DramaProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: TabKey = isTabKey(tabParam) ? tabParam : "overview";

  const [detail, setDetail] = useState<AdminDramaProject | null>(null);
  const [loading, setLoading] = useState(true);

  const id = Number(projectId);

  useEffect(() => {
    if (!id || Number.isNaN(id)) {
      navigate("/drama-projects", { replace: true });
      return;
    }
    setLoading(true);
    void api<AdminDramaProject>(`/api/admin/drama-projects/${id}`)
      .then(setDetail)
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Tải thất bại");
        navigate("/drama-projects", { replace: true });
      })
      .finally(() => setLoading(false));
  }, [id, navigate]);

  function setTab(next: TabKey) {
    const params = new URLSearchParams(searchParams);
    if (next === "overview") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  }

  const usage = detail?.usage;

  if (loading && !detail) {
    return <div className="admin-detail-page-loading">Đang tải…</div>;
  }
  if (!detail) return null;

  return (
    <div className="admin-detail-page">
      <div className="admin-detail-page-toolbar">
        <Button variant="ghost" size="sm" className="admin-detail-back" asChild>
          <Link to="/drama-projects">
            <ArrowLeft className="h-4 w-4" />
            Quay lại danh sách
          </Link>
        </Button>
        <div className="admin-detail-page-heading">
          <h2 className="admin-detail-page-title">
            Phim truyện #{detail.id} · {detail.title}
          </h2>
          <p className="admin-detail-page-sub">
            <AdminEntityLink kind="user" id={detail.user_id} label={detail.user_email ?? undefined} />
            {detail.summary_status ? ` · Tóm tắt ${detail.summary_status}` : ""}
          </p>
        </div>
        <div className="admin-detail-page-actions">
          <Button size="sm" variant="outline" asChild>
            <Link to={`/drama-assets?project_id=${detail.id}`}>Xem thư viện tài sản</Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to={`/drama-episodes?project_id=${detail.id}`}>Xem tập</Link>
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="admin-detail-tabs">
        <TabsList className="admin-detail-tabs-list">
          <TabsTrigger value="overview">Tổng quan</TabsTrigger>
          <TabsTrigger value="episodes">Tập ({detail.episode_count ?? 0}）</TabsTrigger>
          <TabsTrigger value="assets">Tài sản ({detail.asset_count ?? 0}）</TabsTrigger>
          <TabsTrigger value="tasks">Tác vụ ({(detail.recent_tasks ?? []).length}）</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="admin-detail-tab-panel">
          <AdminDetailSection title="Thông tin cơ bản">
            <AdminDetailMeta
              items={[
                {
                  label: "Người dùng",
                  value: (
                    <AdminEntityLink
                      kind="user"
                      id={detail.user_id}
                      label={detail.user_email ?? undefined}
                    />
                  ),
                },
                { label: "Mô tả", value: detail.description || "Không có mô tả", full: true },
                { label: "Trạng thái tóm tắt", value: detail.summary_status || "—" },
                { label: "Trạng thái tập", value: detail.episode_content_status || "—" },
                { label: "Trích xuất tài sản", value: detail.assets_seed_status || "—" },
                { label: "Số tập", value: detail.episode_count ?? 0 },
                { label: "Số tài sản", value: detail.asset_count ?? 0 },
                { label: "Số phân cảnh", value: detail.fragment_count ?? 0 },
                {
                  label: "Thời gian cập nhật",
                  value: detail.updated_at ? new Date(detail.updated_at).toLocaleString() : "—",
                  full: true,
                },
              ]}
            />
          </AdminDetailSection>

          <AdminDetailSection title="Tổng hợp chi phí">
            <AdminDetailStatGrid
              items={[
                { label: "扣费", value: `${points(usage?.charge_fen ?? detail.charge_fen ?? 0)}` },
                { label: "调用", value: usage?.calls ?? 0 },
                {
                  label: "Ảnh/Video/LLM/TTS",
                  value: `${usage?.image_gens ?? 0}/${usage?.video_gens ?? 0}/${usage?.llm_calls ?? 0}/${usage?.tts_gens ?? 0}`,
                },
              ]}
            />
          </AdminDetailSection>
        </TabsContent>

        <TabsContent value="episodes" className="admin-detail-tab-panel">
          <AdminDetailSection title={`Danh sách tập (${(detail.episodes ?? []).length}）`}>
            <AdminDetailTableWrap>
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Tên</th>
                    <th>Số phân cảnh</th>
                    <th>Kế hoạch phân cảnh</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(detail.episodes ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="!text-center text-[var(--admin-muted)]">
                        Chưa có tập
                      </td>
                    </tr>
                  ) : (
                    (detail.episodes ?? []).map((ep) => (
                      <tr key={ep.id}>
                        <td>{ep.id}</td>
                        <td>{ep.name}</td>
                        <td>{ep.fragment_count}</td>
                        <td>{ep.fragment_plan_status || "—"}</td>
                        <td>
                          <Button size="sm" variant="outline" asChild>
                            <Link to={`/drama-episodes/${ep.id}`}>Xem</Link>
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </AdminDetailTableWrap>
          </AdminDetailSection>
        </TabsContent>

        <TabsContent value="assets" className="admin-detail-tab-panel">
          <AdminDetailSection title={`Tài sản dự án (${(detail.assets ?? []).length}）`}>
            <AdminDetailTableWrap>
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Loại</th>
                    <th>Tên</th>
                    <th>Ảnh bìa</th>
                    <th>Tạo</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(detail.assets ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="!text-center text-[var(--admin-muted)]">
                        Chưa có tài sản
                      </td>
                    </tr>
                  ) : (
                    (detail.assets ?? []).map((a) => (
                      <tr key={a.id}>
                        <td>{a.id}</td>
                        <td>{dramaAssetTypeLabel(a.type)}</td>
                        <td className="max-w-[160px] truncate">{a.name || "—"}</td>
                        <td>{a.has_cover ? "Có ảnh chuẩn" : "—"}</td>
                        <td>{formatDramaGenerationStatus(a.generation_status)}</td>
                        <td>
                          <Button size="sm" variant="outline" asChild>
                            <Link to={`/drama-assets/${a.id}`}>Xem</Link>
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </AdminDetailTableWrap>
          </AdminDetailSection>
        </TabsContent>

        <TabsContent value="tasks" className="admin-detail-tab-panel">
          <AdminDetailSection title={`Tác vụ liên quan (gần nhất ${(detail.recent_tasks ?? []).length}）`}>
            <AdminDetailTableWrap>
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Loại</th>
                    <th>Trạng thái</th>
                    <th>Đã trừ / ước tính</th>
                  </tr>
                </thead>
                <tbody>
                  {(detail.recent_tasks ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={4} className="!text-center text-[var(--admin-muted)]">
                        Chưa có tác vụ
                      </td>
                    </tr>
                  ) : (
                    (detail.recent_tasks ?? []).map((t) => (
                      <tr key={t.id}>
                        <td>
                          <AdminEntityLink kind="task" id={t.id} />
                        </td>
                        <td>{taskTypeLabel(t.task_type)}</td>
                        <td>{taskStatusLabel(t.status)}</td>
                        <td>
                          {points(t.billing_charged_fen)} / {points(t.billing_estimate_fen)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </AdminDetailTableWrap>
          </AdminDetailSection>
        </TabsContent>
      </Tabs>
    </div>
  );
}
