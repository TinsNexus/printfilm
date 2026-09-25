import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, type AdminWork, type PageMeta } from "@/api/client";
import { AdminDetailMeta, AdminDetailSection } from "@/components/admin/AdminDetailLayout";
import { AdminEntityLink } from "@/components/admin/AdminEntityLink";
import { AdminFilterBar } from "@/components/admin/AdminFilterBar";
import { AdminModal } from "@/components/admin/AdminModal";
import { AdminSearchInput } from "@/components/admin/AdminSearchInput";
import { AdminUserSearchSelect } from "@/components/admin/AdminUserSearchSelect";
import { PaginationBar } from "@/components/PaginationBar";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/page";
import { useAdminDetailQuery } from "@/hooks/useAdminDetailQuery";
import { auditStatusLabel, visibilityLabel } from "@/lib/statusLabels";
import { formatDateTime, useI18n } from "@/i18n";

type ListRes = { items: AdminWork[]; meta: PageMeta };

function coverSrc(url: string | null | undefined): string {
  const trimmed = (url || "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

// 作品审核：搜索、预览与只读详情
export function WorksPage() {
  const { t: tx } = useI18n();
  const [auditStatus, setAuditStatus] = useState("");
  const [visibility, setVisibility] = useState("");
  const [q, setQ] = useState("");
  const [userId, setUserId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListRes | null>(null);
  const [detail, setDetail] = useState<AdminWork | null>(null);
  const workDetail = useAdminDetailQuery("work");

  async function load(nextPage = page) {
    try {
      const params = new URLSearchParams({ page: String(nextPage), page_size: String(DEFAULT_PAGE_SIZE) });
      if (auditStatus) params.set("audit_status", auditStatus);
      if (visibility) params.set("visibility", visibility);
      if (q.trim()) params.set("q", q.trim());
      if (userId) params.set("user_id", String(userId));
      setData(await api<ListRes>(`/api/admin/works?${params}`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tx("works.failedLoad"));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  useEffect(() => {
    if (!workDetail.id || !data?.items) return;
    const hit = data.items.find((w) => w.id === workDetail.id);
    if (hit) setDetail(hit);
  }, [workDetail.id, data?.items]);

  async function patchWork(id: number, body: { visibility?: string; audit_status?: string }) {
    try {
      await api(`/api/admin/works/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      toast.success(tx("works.updated"));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tx("works.updateFailed"));
    }
  }

  function openWork(work: AdminWork) {
    setDetail(work);
    workDetail.open(work.id);
  }

  return (
    <div className="admin-list-page">
      <PageHeader description={tx("works.adjustVisibilityReviewStatus")} />
      <AdminFilterBar>
        <AdminSearchInput
          value={q}
          onChange={setQ}
          placeholder={tx("works.searchTitle")}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setPage(1);
              void load(1);
            }
          }}
        />
        <AdminUserSearchSelect value={userId} onChange={(id) => setUserId(id)} />
        <Select value={auditStatus} onChange={(e) => setAuditStatus(e.target.value)}>
          <option value="">{tx("works.allReviewStates")}</option>
          <option value="pending">{tx("works.pendingReview")}</option>
          <option value="passed">{tx("works.approved")}</option>
          <option value="rejected">{tx("works.rejected")}</option>
        </Select>
        <Select value={visibility} onChange={(e) => setVisibility(e.target.value)}>
          <option value="">{tx("works.allVisibility")}</option>
          <option value="public">{tx("works.public")}</option>
          <option value="private">{tx("works.private")}</option>
          <option value="unlisted">{tx("works.unlisted")}</option>
        </Select>
        <Button
          size="sm"
          variant="secondary"
          className="admin-filter-action"
          onClick={() => {
            setPage(1);
            void load(1);
          }}
        >
          {tx("works.filter")}
        </Button>
      </AdminFilterBar>
      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tx("works.cover")}</TableHead>
              <TableHead>ID</TableHead>
              <TableHead>{tx("works.title")}</TableHead>
              <TableHead>{tx("works.user")}</TableHead>
              <TableHead>{tx("works.visibility")}</TableHead>
              <TableHead>{tx("works.review")}</TableHead>
              <TableHead>{tx("works.published")}</TableHead>
              <TableHead>{tx("works.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.items ?? []).map((w) => (
              <TableRow key={w.id}>
                <TableCell>
                  {w.cover_url ? (
                    <button type="button" onClick={() => openWork(w)} className="block">
                      <img src={coverSrc(w.cover_url)} alt={w.title} className="admin-thumb" loading="lazy" />
                    </button>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>{w.id}</TableCell>
                <TableCell className="max-w-[200px] truncate">
                  <button type="button" className="admin-link text-left" onClick={() => openWork(w)}>
                    {w.title}
                  </button>
                </TableCell>
                <TableCell>
                  <AdminEntityLink kind="user" id={w.user_id} label={w.user_email ?? undefined} />
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{visibilityLabel(w.visibility)}</Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      w.audit_status === "rejected"
                        ? "destructive"
                        : w.audit_status === "passed"
                          ? "success"
                          : "warning"
                    }
                  >
                    {auditStatusLabel(w.audit_status)}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatDateTime(w.published_at)}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="outline" onClick={() => openWork(w)}>
                      {tx("works.details")}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void patchWork(w.id, { audit_status: "passed" })}>
                      {tx("works.approve")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void patchWork(w.id, { audit_status: "rejected" })}
                    >
                      {tx("works.reject")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void patchWork(w.id, {
                          visibility: w.visibility === "public" ? "private" : "public",
                        })
                      }
                    >
                      {w.visibility === "public" ? tx("works.makePrivate") : tx("works.makePublic")}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {data && (
        <PaginationBar
          page={data.meta.page}
          pageSize={data.meta.page_size}
          total={data.meta.total}
          onPageChange={setPage}
        />
      )}

      <AdminModal
        open={workDetail.isOpen && !!detail}
        onOpenChange={(open) => {
          if (!open) {
            setDetail(null);
            workDetail.close();
          }
        }}
        size="lg"
        title={detail?.title ?? tx("works.workDetails")}
        subtitle={detail ? tx("works.work", { detailId: detail.id }) : undefined}
      >
        {detail ? (
          <>
            {(detail.cover_url || detail.video_url) ? (
              <AdminDetailSection title={tx("works.mediaPreview")}>
                <div className="admin-detail-media">
                  {detail.cover_url ? (
                    <img src={coverSrc(detail.cover_url)} alt={detail.title} />
                  ) : null}
                  {detail.video_url ? (
                    <video src={detail.video_url} controls className="max-w-full" />
                  ) : null}
                </div>
              </AdminDetailSection>
            ) : null}
            <AdminDetailSection title={tx("works.basicInfo")}>
              <AdminDetailMeta
                items={[
                  {
                    label: tx("works.user"),
                    value: (
                      <AdminEntityLink
                        kind="user"
                        id={detail.user_id}
                        label={detail.user_email ?? undefined}
                      />
                    ),
                  },
                  {
                    label: tx("works.linkedProject"),
                    value: detail.project_id ? (
                      <AdminEntityLink kind="project" id={detail.project_id} />
                    ) : (
                      "—"
                    ),
                  },
                  { label: tx("works.visibility"), value: visibilityLabel(detail.visibility) },
                  { label: tx("works.review"), value: auditStatusLabel(detail.audit_status) },
                  {
                    label: tx("works.published"),
                    value: formatDateTime(detail.published_at),
                    full: true,
                  },
                ]}
              />
            </AdminDetailSection>
            {detail.video_url ? (
              <Button size="sm" variant="outline" asChild>
                <a href={detail.video_url} target="_blank" rel="noreferrer">
                  {tx("works.openVideoNewWindow")}
                </a>
              </Button>
            ) : null}
          </>
        ) : null}
      </AdminModal>
    </div>
  );
}
