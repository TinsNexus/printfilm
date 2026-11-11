import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { api, type AdminDramaEpisode } from "@/api/client";
import {
  AdminDetailMeta,
  AdminDetailSection,
  AdminDetailTableWrap,
} from "@/components/admin/AdminDetailLayout";
import { AdminEntityLink } from "@/components/admin/AdminEntityLink";
import { Button } from "@/components/ui/button";
import { formatDramaGenerationStatus } from "@/lib/dramaLabels";
import { tr } from "../../i18n/translate.ts";

/** 漫剧分集详情：含分镜列表 */
export function DramaEpisodeDetailPage() {
  const { episodeId } = useParams<{ episodeId: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<AdminDramaEpisode | null>(null);
  const [loading, setLoading] = useState(true);
  const id = Number(episodeId);

  useEffect(() => {
    if (!id || Number.isNaN(id)) {
      navigate("/drama-episodes", { replace: true });
      return;
    }
    setLoading(true);
    void api<AdminDramaEpisode>(`/api/admin/drama-episodes/${id}`)
      .then(setDetail)
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : tr("dramaUi.loadFailed"));
        navigate("/drama-episodes", { replace: true });
      })
      .finally(() => setLoading(false));
  }, [id, navigate]);

  if (loading && !detail) {
    return <div className="admin-detail-page-loading">{tr("dramaUi.loading")}</div>;
  }
  if (!detail) return null;

  return (
    <div className="admin-detail-page">
      <div className="admin-detail-page-toolbar">
        <Button variant="ghost" size="sm" className="admin-detail-back" asChild>
          <Link to="/drama-episodes">
            <ArrowLeft className="h-4 w-4" />
            {tr("dramaUi.backToEpisodes")}
          </Link>
        </Button>
        <div className="admin-detail-page-heading">
          <h2 className="admin-detail-page-title">
            {tr("dramaUi.episodeTitle", { id: detail.id, name: detail.name })}
          </h2>
          <p className="admin-detail-page-sub">
            <AdminEntityLink kind="drama" id={detail.project_id} label={detail.project_title ?? undefined} />
          </p>
        </div>
        <div className="admin-detail-page-actions">
          <Button size="sm" variant="outline" asChild>
            <Link to={`/drama-projects/${detail.project_id}?tab=episodes`}>{tr("dramaUi.openProject")}</Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to={`/drama-fragments?episode_id=${detail.id}`}>{tr("dramaUi.allShots")}</Link>
          </Button>
        </div>
      </div>

      <AdminDetailSection title={tr("dramaUi.secBasic")}>
        <AdminDetailMeta
          items={[
            {
              label: tr("dramaUi.user"),
              value: detail.user_id ? (
                <AdminEntityLink kind="user" id={detail.user_id} label={detail.user_email ?? undefined} />
              ) : (
                "—"
              ),
            },
            {
              label: tr("dramaUi.ownerProject"),
              value: <AdminEntityLink kind="drama" id={detail.project_id} label={detail.project_title ?? undefined} />,
            },
            { label: tr("dramaUi.shotCount"), value: detail.fragment_count },
            { label: tr("dramaUi.shotPlan"), value: detail.fragment_plan_status || "—" },
            {
              label: tr("dramaUi.updatedAt"),
              value: detail.updated_at ? new Date(detail.updated_at).toLocaleString() : "—",
            },
          ]}
        />
      </AdminDetailSection>

      <AdminDetailSection title={tr("dramaUi.shotListN", { n: (detail.fragments ?? []).length })}>
        <AdminDetailTableWrap>
          <table>
            <thead>
              <tr>
                <th>{tr("dramaUi.order")}</th>
                <th>ID</th>
                <th>{tr("dramaUi.content")}</th>
                <th>{tr("dramaUi.duration")}</th>
                <th>{tr("dramaUi.generation")}</th>
                <th>{tr("dramaUi.assetRefs")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(detail.fragments ?? []).length === 0 ? (
                <tr>
                  <td colSpan={7} className="!text-center text-[var(--admin-muted)]">
                    {tr("dramaUi.noShots")}
                  </td>
                </tr>
              ) : (
                (detail.fragments ?? []).map((f) => (
                  <tr key={f.id}>
                    <td>{f.sort_order}</td>
                    <td>{f.id}</td>
                    <td className="max-w-[240px] truncate">{f.content || "—"}</td>
                    <td>{f.duration_sec != null ? `${f.duration_sec}s` : "—"}</td>
                    <td className="text-xs text-[var(--admin-muted)]">
                      {formatDramaGenerationStatus(f.generation_status)}
                    </td>
                    <td>{f.asset_ref_count}</td>
                    <td>
                      <Button size="sm" variant="outline" asChild>
                        <Link to={`/drama-fragments/${f.id}`}>{tr("dramaUi.view")}</Link>
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </AdminDetailTableWrap>
      </AdminDetailSection>
    </div>
  );
}
