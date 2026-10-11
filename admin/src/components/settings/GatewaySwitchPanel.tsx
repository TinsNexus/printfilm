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
};

const DEFAULT_9ROUTER_URL = "http://localhost:20128/v1";

// 上游网关开关：TokenFree / 9Router 即插即用切换，保存后立即生效，无需重启
export function GatewaySwitchPanel({ onChanged }: { onChanged?: () => void }) {
  const { t: tx } = useI18n();
  const [state, setState] = useState<GatewayState | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<GatewayState>("/api/admin/settings/models");
      setState({
        upstream_gateway_type: res.upstream_gateway_type === "9router" ? "9router" : "tokenfree",
        ninerouter_base_url: res.ninerouter_base_url || DEFAULT_9ROUTER_URL,
        has_ninerouter_api_key: Boolean(res.has_ninerouter_api_key),
      });
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
      await api("/api/admin/settings/models", {
        method: "PATCH",
        body: JSON.stringify({
          upstream_gateway_type: next.upstream_gateway_type,
          ninerouter_base_url: next.ninerouter_base_url.trim(),
          ninerouter_api_key: keyInput.trim() || undefined,
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
