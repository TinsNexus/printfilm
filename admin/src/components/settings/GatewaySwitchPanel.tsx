import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/api/client";
import { LabeledControl, SettingsPanel } from "@/components/settings/SettingsPanel";
import { useI18n } from "@/i18n";

type GatewayType = "tokenfree" | "9router";

type GatewayState = {
  upstream_gateway_type: GatewayType;
  ninerouter_base_url: string;
  has_ninerouter_api_key: boolean;
  ninerouter_plan_names: string[];
};

// 套餐 Key 行：existing 表示库里已有（Key 留空即保持不变）
type PlanRow = { plan: string; key: string; existing: boolean };

const DEFAULT_9ROUTER_URL = "http://localhost:20128/v1";

// 上游网关开关：TokenFree / 9Router 即插即用切换，保存后立即生效，无需重启
export function GatewaySwitchPanel({ onChanged }: { onChanged?: () => void }) {
  const { t: tx } = useI18n();
  const [state, setState] = useState<GatewayState | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [planRows, setPlanRows] = useState<PlanRow[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<GatewayState>("/api/admin/settings/models");
      setState({
        upstream_gateway_type: res.upstream_gateway_type === "9router" ? "9router" : "tokenfree",
        ninerouter_base_url: res.ninerouter_base_url || DEFAULT_9ROUTER_URL,
        has_ninerouter_api_key: Boolean(res.has_ninerouter_api_key),
        ninerouter_plan_names: res.ninerouter_plan_names ?? [],
      });
      setPlanRows((res.ninerouter_plan_names ?? []).map((plan) => ({ plan, key: "", existing: true })));
      setKeyInput("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tx("routing.gatewayLoadFailed"));
    }
  }, [tx]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(next: GatewayState) {
    setSaving(true);
    try {
      // 增量：有新 Key 则设置/覆盖；被删掉的已有套餐传空串删除
      const planPatch: Record<string, string> = {};
      for (const row of planRows) {
        const name = row.plan.trim();
        if (name && row.key.trim()) planPatch[name] = row.key.trim();
      }
      const kept = new Set(planRows.map((r) => r.plan.trim()));
      for (const name of next.ninerouter_plan_names) {
        if (!kept.has(name)) planPatch[name] = "";
      }
      await api("/api/admin/settings/models", {
        method: "PATCH",
        body: JSON.stringify({
          upstream_gateway_type: next.upstream_gateway_type,
          ninerouter_base_url: next.ninerouter_base_url.trim(),
          ninerouter_api_key: keyInput.trim() || undefined,
          ninerouter_plan_keys: Object.keys(planPatch).length ? planPatch : undefined,
        }),
      });
      toast.success(tx("routing.gatewaySaved"));
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tx("routing.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  if (!state) return null;
  const is9router = state.upstream_gateway_type === "9router";

  return (
    <SettingsPanel title={tx("routing.gatewayTitle")} description={tx("routing.gatewayDescription")}>
      <div className="settings-field-grid">
        <LabeledControl label={tx("routing.gatewayCurrent")} className="settings-field-span-full">
          <select
            className="settings-select"
            value={state.upstream_gateway_type}
            disabled={saving}
            onChange={(e) => setState({ ...state, upstream_gateway_type: e.target.value as GatewayType })}
          >
            <option value="tokenfree">TokenFree New API</option>
            <option value="9router">9Router</option>
          </select>
        </LabeledControl>
        {is9router ? (
          <>
            <LabeledControl label="9Router Base URL" className="settings-field-span-full">
              <input
                className="settings-input"
                value={state.ninerouter_base_url}
                onChange={(e) => setState({ ...state, ninerouter_base_url: e.target.value })}
              />
            </LabeledControl>
            <LabeledControl
              label="9Router API Key"
              hint={state.has_ninerouter_api_key ? tx("routing.savedLeaveBlankKeep") : undefined}
              className="settings-field-span-full"
            >
              <input
                className="settings-input is-secret"
                type="password"
                placeholder={state.has_ninerouter_api_key ? tx("routing.savedLeaveBlankKeep2") : "sk-..."}
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
              />
              <p className="mt-1 text-xs text-[#909399]">{tx("routing.gatewayNoBilling")}</p>
            </LabeledControl>
            <LabeledControl
              label={tx("routing.gatewayPlanKeys")}
              hint={tx("routing.gatewayPlanKeysHint")}
              className="settings-field-span-full"
            >
              <div className="space-y-2">
                {planRows.map((row, idx) => (
                  <div key={idx} className="settings-secret-row">
                    <input
                      className="settings-input"
                      style={{ maxWidth: 160 }}
                      placeholder={tx("routing.gatewayPlanName")}
                      value={row.plan}
                      disabled={row.existing}
                      onChange={(e) =>
                        setPlanRows(planRows.map((r, i) => (i === idx ? { ...r, plan: e.target.value } : r)))
                      }
                    />
                    <input
                      className="settings-input is-secret"
                      type="password"
                      placeholder={row.existing ? tx("routing.savedLeaveBlankKeep2") : "sk-..."}
                      value={row.key}
                      onChange={(e) =>
                        setPlanRows(planRows.map((r, i) => (i === idx ? { ...r, key: e.target.value } : r)))
                      }
                    />
                    <button
                      type="button"
                      className="admin-btn admin-btn-secondary settings-mini-btn"
                      onClick={() => setPlanRows(planRows.filter((_, i) => i !== idx))}
                    >
                      {tx("routing.clear")}
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary settings-mini-btn"
                  onClick={() => setPlanRows([...planRows, { plan: "", key: "", existing: false }])}
                >
                  {tx("routing.gatewayAddPlan")}
                </button>
              </div>
            </LabeledControl>
          </>
        ) : null}
        <div className="settings-field-span-full">
          <button type="button" className="admin-btn admin-btn-primary" disabled={saving} onClick={() => void save(state)}>
            {saving ? tx("routing.gatewaySaving") : tx("routing.gatewaySave")}
          </button>
        </div>
      </div>
    </SettingsPanel>
  );
}
