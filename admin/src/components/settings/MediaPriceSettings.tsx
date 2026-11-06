import { useEffect, useRef, useState } from "react";
import { api } from "@/api/client";
import { AdminField } from "@/components/admin/AdminField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SettingsPanel } from "./SettingsPanel";

type PriceData = {
  active_version: number | null; enabled: boolean; prices: Record<string, Record<string, string>>;
  strategies: Array<{ id: string; capability: string; allowed_resolutions: string[]; duration_min?: number; duration_max?: number }>;
};
function priceError(value: string) {
  if (!value.trim()) return "";
  if (!/^\d+(?:\.\d{1,4})?$/.test(value.trim())) return "Vui lòng nhập số tiền, tối đa 4 chữ số thập phân";
  return Number(value) < 0.0001 || Number(value) > 10000 ? "Đơn giá trong khoảng 0,0001–10000 tệ" : "";
}

/** Price publishing is independent from the surrounding payment settings save. */
export function MediaPriceSettings() {
  const [data, setData] = useState<PriceData | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [operation, setOperation] = useState<"" | "load" | "publish" | "toggle">("");
  const baseline = useRef("");
  const busy = Boolean(operation);
  const dirty = Boolean(data && baseline.current !== JSON.stringify(data.prices));
  const invalidPrices = data ? Object.values(data.prices).some(rows => Object.values(rows).some(price => priceError(price))) : false;
  async function load() {
    try {
      const loaded = await api<PriceData>("/api/admin/settings/billing/media-prices");
      baseline.current = JSON.stringify(loaded.prices); setData(loaded); setError(""); return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Tải giá thất bại"); return false; }
  }
  useEffect(() => { void load(); }, []);
  async function reload() {
    if (busy) return;
    setOperation("load"); setNotice("");
    try { await load(); } finally { setOperation(""); }
  }
  async function toggle() {
    if (!data?.active_version || busy) return;
    setOperation("toggle"); setNotice(""); setError("");
    try {
      await api("/api/admin/settings/billing/media-prices/activation", { method: "PATCH", body: JSON.stringify({ enabled: !data.enabled, expected_version: data.active_version }) });
      setData(current => current ? { ...current, enabled: !data.enabled } : current);
      setNotice("Đã chuyển chế độ tính phí, chỉ ảnh hưởng tác vụ mới, tác vụ đang chạy giữ quy tắc cũ.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Chuyển thất bại"); }
    finally { setOperation(""); }
  }
  async function publish() {
    if (!data || busy || invalidPrices) return;
    setOperation("publish"); setError(""); setNotice("");
    try {
      const prices = Object.fromEntries(Object.entries(data.prices).map(([model, rows]) => [model,
        Object.fromEntries(Object.entries(rows).filter(([, value]) => value.trim() !== "").map(([resolution, value]) => [resolution, value.trim()])),
      ]));
      await api("/api/admin/settings/billing/media-prices", { method: "POST", body: JSON.stringify({ prices, expected_version: data.active_version }) });
      const refreshed = await load();
      setNotice(refreshed ? "Đã phát hành giá, tác vụ mới có hiệu lực ngay, tác vụ đang chạy giữ giá cũ." : "Đã phát hành giá, đọc phiên bản mới nhất thất bại, vui lòng tải lại rồi tiếp tục chỉnh sửa.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Phát hành thất bại"); }
    finally { setOperation(""); }
  }
  return <SettingsPanel title="Giá hình ảnh và video" description="Hình ảnh tính theo ảnh, video tính theo số giây gửi. Phần này phát hành riêng, sửa cấu hình thanh toán sẽ không phát hành giá.">
    <div className="admin-form-notice">{data?.active_version ? `Phiên bản giá hiện tại #${data.active_version} · ${data.enabled ? "Đã bật tính phí cố định" : "Đã tắt tính phí cố định"}` : "Chưa phát hành phiên bản giá"}{dirty ? " · Có thay đổi chưa phát hành" : ""}</div>
    <p className="settings-price-note">Đơn giá tính bằng nhân dân tệ, tối đa 4 chữ số thập phân. Để trống nghĩa là mức này không thể tạo; tổng giá video = đơn giá × số giây gửi.</p>
    {error ? <p role="alert" className="admin-field-error">{error}</p> : null}
    {notice ? <p role="status" className="settings-price-note">{notice}</p> : null}
    {!data && !error ? <p className="settings-price-note" role="status">Đang tải giá…</p> : null}
    {data && ["image", "video"].map(kind => <details key={kind} className="settings-advanced mt-4" open={kind === "image" ? true : undefined}>
      <summary>{kind === "image" ? "Giá hình ảnh · tệ / ảnh" : "Giá video · tệ / giây"}</summary>
      <div className="settings-price-table admin-table-wrap"><table><thead><tr><th>Model / phạm vi hỗ trợ</th><th>Độ phân giải và đơn giá</th></tr></thead><tbody>
        {data.strategies.filter(strategy => strategy.capability === kind).map(strategy => <tr key={strategy.id}>
          <td><strong className="text-xs">{strategy.id}</strong><p className="settings-price-note">{strategy.duration_max ? `${strategy.duration_min}–${strategy.duration_max} giây` : "Tính theo số ảnh giao thành công"}</p></td>
          <td><div className="settings-price-cell">{strategy.allowed_resolutions.map(resolution => {
            const value = data.prices[strategy.id]?.[resolution] ?? "";
            return <AdminField key={resolution} label={resolution} error={priceError(value)} hint={value ? `tệ / ${kind === "image" ? "ảnh" : "giây"}` : "Chưa cấu hình, không thể tạo"}>
              <Input type="text" inputMode="decimal" disabled={busy} aria-label={`${strategy.id} ${resolution} Đơn giá`} placeholder="Chưa cấu hình" value={value}
                onChange={event => { setNotice(""); setData({ ...data, prices: { ...data.prices, [strategy.id]: { ...data.prices[strategy.id], [resolution]: event.target.value } } }); }} />
            </AdminField>;
          })}</div></td>
        </tr>)}
      </tbody></table></div>
    </details>)}
    <div className="settings-price-actions">
      <Button disabled={!data || busy || invalidPrices} onClick={() => void publish()}>{operation === "publish" ? "Đang phát hành…" : "Phát hành phiên bản giá"}</Button>
      <Button variant="outline" disabled={busy} onClick={() => void reload()}>{operation === "load" ? "Đang tải…" : dirty ? "Hủy thay đổi và tải lại" : "Tải lại"}</Button>
      {data?.active_version ? <Button variant="outline" disabled={busy} onClick={() => void toggle()}>{operation === "toggle" ? "Đang chuyển…" : data.enabled ? "Tắt tính phí cố định" : "Bật tính phí cố định"}</Button> : null}
    </div>
  </SettingsPanel>;
}
