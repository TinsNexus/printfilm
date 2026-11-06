import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity } from "lucide-react";
import { toast } from "sonner";
import { api, type AdminModelSettings } from "@/api/client";
import {
  LabeledControl,
  SettingsLoading,
  SettingsPanel,
  SettingsStatusBar,
  SettingsTabShell,
} from "@/components/settings/SettingsPanel";
import { Switch } from "@/components/ui/switch";

const NUMBER_FIELDS = [
  "seedance_duration_min", "seedance_duration_max", "ark_video_poll_interval", "ark_video_poll_timeout",
  "pipeline_image_concurrency", "pipeline_video_concurrency", "pipeline_audio_concurrency",
  "task_runtime_max_concurrency", "task_user_max_concurrency", "task_poll_max_concurrency",
  "drama_user_video_job_limit", "drama_fragment_max_attempts",
] as const;
type NumberField = (typeof NUMBER_FIELDS)[number];

// 运行参数配置（并发、质量、Mock 等 flat 字段）
export function RuntimeSettingsPanel() {
  const [form, setForm] = useState<AdminModelSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [numberDrafts, setNumberDrafts] = useState<Partial<Record<NumberField, string>>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<AdminModelSettings>("/api/admin/settings/models");
      setForm(data);
      setNumberDrafts({});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Tải thất bại");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const statusItems = useMemo(
    () =>
      (form?.readiness ?? []).map((item) => ({
        id: item.capability,
        label: item.label,
        ready: item.ready,
        readyText: item.model || "Sẵn sàng",
        pendingText: "Chưa sẵn sàng",
      })),
    [form?.readiness],
  );

  function patchField<K extends keyof AdminModelSettings>(key: K, value: AdminModelSettings[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  const errors: Partial<Record<NumberField | "ark_image_size" | "ark_video_resolution" | "ark_video_ratio", string>> = {};
  if (form) {
    NUMBER_FIELDS.forEach((key) => {
      const raw = numberDrafts[key] ?? String(form[key]);
      const value = Number(raw);
      const seconds = key === "ark_video_poll_interval" || key === "ark_video_poll_timeout";
      if (!raw.trim() || !Number.isFinite(value) || value <= 0) errors[key] = seconds ? "Vui lòng nhập số giây lớn hơn 0" : "Vui lòng nhập số nguyên không nhỏ hơn 1";
      else if (!seconds && !Number.isInteger(value)) errors[key] = "Vui lòng nhập số nguyên";
    });
    if (!errors.seedance_duration_min && !errors.seedance_duration_max && form.seedance_duration_min > form.seedance_duration_max) {
      errors.seedance_duration_max = "Thời lượng tối đa không được nhỏ hơn thời lượng tối thiểu";
    }
    if (!errors.ark_video_poll_interval && !errors.ark_video_poll_timeout && form.ark_video_poll_timeout <= form.ark_video_poll_interval) {
      errors.ark_video_poll_timeout = "Thời gian chờ phải lớn hơn khoảng thời gian thăm dò";
    }
    (["ark_image_size", "ark_video_resolution", "ark_video_ratio"] as const).forEach((key) => {
      if (!form[key].trim()) errors[key] = "Vui lòng nhập giá trị mặc định";
    });
  }
  const hasErrors = Object.keys(errors).length > 0;

  function numberField(key: NumberField, label: string, hint: string, unit: string) {
    if (!form) return null;
    const seconds = key === "ark_video_poll_interval" || key === "ark_video_poll_timeout";
    return (
      <LabeledControl label={label} hint={hint} error={errors[key]} required>
        <div className="relative">
          <input
            className="settings-input !pr-12"
            type="number" required min={seconds ? 0 : 1} step={seconds ? "any" : 1}
            aria-invalid={Boolean(errors[key])}
            value={numberDrafts[key] ?? form[key]}
            onChange={(event) => {
              const raw = event.target.value;
              setNumberDrafts((prev) => ({ ...prev, [key]: raw }));
              if (raw.trim() && Number.isFinite(Number(raw))) patchField(key, Number(raw));
            }}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--admin-muted)]">{unit}</span>
        </div>
      </LabeledControl>
    );
  }

  async function handleSave() {
    if (!form || saving || hasErrors) return;
    setSaving(true);
    try {
      const body = {
        ark_image_size: form.ark_image_size,
        ark_video_resolution: form.ark_video_resolution,
        ark_video_ratio: form.ark_video_ratio,
        seedance_duration_min: form.seedance_duration_min,
        seedance_duration_max: form.seedance_duration_max,
        ark_video_poll_interval: form.ark_video_poll_interval,
        ark_video_poll_timeout: form.ark_video_poll_timeout,
        pipeline_image_concurrency: form.pipeline_image_concurrency,
        pipeline_video_concurrency: form.pipeline_video_concurrency,
        pipeline_audio_concurrency: form.pipeline_audio_concurrency,
        task_runtime_max_concurrency: form.task_runtime_max_concurrency,
        task_user_max_concurrency: form.task_user_max_concurrency,
        task_poll_max_concurrency: form.task_poll_max_concurrency,
        drama_user_video_job_limit: form.drama_user_video_job_limit,
        drama_fragment_max_attempts: form.drama_fragment_max_attempts,
        ark_mock: form.ark_mock,
      };
      await api("/api/admin/settings/models", { method: "PATCH", body: JSON.stringify(body) });
      await load();
      toast.success("Đã lưu tham số chạy");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !form) {
    return <SettingsLoading />;
  }

  return (
    <SettingsTabShell onSave={handleSave} saving={saving} disabled={hasErrors} saveLabel="Lưu cài đặt chạy">
      <SettingsStatusBar
        title="Trạng thái sẵn sàng của route"
        items={
          statusItems.length > 0
            ? statusItems
            : [{ id: "empty", label: "Route năng lực", ready: false, pendingText: "Vui lòng nhập Key ở “Model” và chọn model trước" }]
        }
        extra={
          <span className="settings-status-extra">
            {form.readiness?.length && form.readiness.every((item) => item.ready) ? "Bốn loại năng lực đã sẵn sàng" : "Vui lòng nhập TokenFree Key ở “Model” và chọn model"}
          </span>
        }
      />

      <SettingsPanel title="Giá trị mặc định khi tạo" description="Đặt chất lượng, tỷ lệ khung hình và thời lượng mặc định cho tác vụ tạo mới; phạm vi hỗ trợ cụ thể vẫn do model được chọn quyết định.">
        <div className="settings-field-grid settings-field-grid--3">
          <LabeledControl label="Kích thước tạo ảnh" hint="Dùng kích thước upstream hỗ trợ, ví dụ 2K hoặc 1024x1024." error={errors.ark_image_size} required>
            <input className="settings-input" required placeholder="Ví dụ 2K" aria-invalid={Boolean(errors.ark_image_size)} value={form.ark_image_size} onChange={(e) => patchField("ark_image_size", e.target.value)} />
          </LabeledControl>
          <LabeledControl label="Độ nét video" hint="Ví dụ 480p, 720p; lấy theo giá trị model hiện tại hỗ trợ." error={errors.ark_video_resolution} required>
            <input className="settings-input" required placeholder="Ví dụ 720p" aria-invalid={Boolean(errors.ark_video_resolution)} value={form.ark_video_resolution} onChange={(e) => patchField("ark_video_resolution", e.target.value)} />
          </LabeledControl>
          <LabeledControl label="Tỷ lệ khung video" hint="Rộng:cao, ví dụ 16:9 hoặc 9:16." error={errors.ark_video_ratio} required>
            <input className="settings-input" required placeholder="Ví dụ 16:9" aria-invalid={Boolean(errors.ark_video_ratio)} value={form.ark_video_ratio} onChange={(e) => patchField("ark_video_ratio", e.target.value)} />
          </LabeledControl>
        </div>
        <div className="settings-field-grid settings-field-grid--2 mt-5">
          {numberField("seedance_duration_min", "Thời lượng tối thiểu Seedance", "Không nhỏ hơn 1 giây, cùng với thời lượng tối đa giới hạn độ dài mỗi đoạn tạo.", "giây")}
          {numberField("seedance_duration_max", "Thời lượng tối đa Seedance", "Không nhỏ hơn thời lượng tối thiểu; cuối cùng vẫn bị giới hạn bởi phạm vi thời lượng của model.", "giây")}
        </div>
      </SettingsPanel>

      <SettingsPanel title="Đồng thời tác vụ" description="Kiểm soát số tác vụ chạy cùng lúc và tài nguyên một người dùng có thể chiếm.">
        <div className="settings-field-grid settings-field-grid--3">
          {numberField("task_runtime_max_concurrency", "Khe thực thi toàn site", "Số tác vụ Worker toàn site có thể chạy đồng thời, không nhỏ hơn 1.", "")}
          {numberField("task_user_max_concurrency", "Khe thực thi mỗi người dùng", "Số tác vụ một người dùng có thể chiếm, vẫn bị giới hạn bởi khe toàn site.", "")}
          {numberField("drama_user_video_job_limit", "Giới hạn video phim truyện đang chạy mỗi người dùng", "Giới hạn tổng số tác vụ video đang xếp hàng và đang xử lý, không nhỏ hơn 1.", "")}
        </div>
        <div className="settings-runtime-note mt-5">
          <Activity className="h-4 w-4 shrink-0 text-[var(--admin-forest)]" />
          <span>Bản nháp hiện tại: toàn site <strong>{form.task_runtime_max_concurrency}</strong> khe thực thi, mỗi người dùng tối đa <strong>{form.task_user_max_concurrency}</strong> ; tác vụ đang chờ upstream thăm dò không chiếm khe Worker.</span>
        </div>
      </SettingsPanel>

      <details className="settings-advanced">
        <summary><span>Tham số chạy nâng cao</span><span>Phân bổ pipeline, thăm dò và chế độ mô phỏng</span></summary>
        <SettingsPanel title="Pipeline tạo" description="Kiểm soát riêng số xử lý song song của từng loại tác vụ phương tiện; đều là số nguyên không nhỏ hơn 1.">
          <div className="settings-field-grid settings-field-grid--3">
            {numberField("pipeline_image_concurrency", "Đồng thời tạo ảnh", "Số tác vụ hình ảnh xử lý cùng lúc.", "luồng")}
            {numberField("pipeline_video_concurrency", "Đồng thời video", "Số tác vụ video xử lý cùng lúc.", "luồng")}
            {numberField("pipeline_audio_concurrency", "Đồng thời lồng tiếng", "Số tác vụ lồng tiếng xử lý cùng lúc.", "luồng")}
          </div>
        </SettingsPanel>
        <SettingsPanel title="Thăm dò và thử lại upstream" description="Cân bằng giữa tần suất truy vấn và thời gian chờ; thời gian chờ phải lớn hơn khoảng truy vấn.">
          <div className="settings-field-grid settings-field-grid--2">
            {numberField("ark_video_poll_interval", "Khoảng thăm dò video", "Lớn hơn 0 giây; khoảng càng ngắn thì tần suất truy vấn upstream càng cao.", "giây")}
            {numberField("ark_video_poll_timeout", "Hết thời gian thăm dò video", "Lớn hơn khoảng thăm dò; quá thời gian này sẽ ngừng chờ.", "giây")}
            {numberField("task_poll_max_concurrency", "Đồng thời truy vấn upstream mỗi vòng", "Số luồng tối đa Selector truy vấn không chặn mỗi vòng, không nhỏ hơn 1.", "luồng")}
            {numberField("drama_fragment_max_attempts", "Số lần thử tối đa của video phân cảnh", "Gồm lần tạo đầu và các lần thử lại sau khi thất bại, không nhỏ hơn 1.", "lần")}
          </div>
        </SettingsPanel>
        <SettingsPanel title="Phát triển và gỡ lỗi" description="Chuyển cách chạy của yêu cầu tạo.">
          <div className="settings-toggle-row">
            <div><strong>Chế độ ARK Mock</strong><span>Dùng kết quả mô phỏng để gỡ lỗi giao diện ARK, khi bật sẽ không gọi upstream thật tương ứng.</span></div>
            <Switch aria-label="Chế độ ARK Mock" checked={form.ark_mock} onCheckedChange={(v) => patchField("ark_mock", v)} />
          </div>
        </SettingsPanel>
      </details>
    </SettingsTabShell>
  );
}
