import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/api/client";
import { LabeledControl, SettingsPanel } from "@/components/settings/SettingsPanel";

type GatewayType = "tokenfree" | "9router";

type GatewayState = {
  upstream_gateway_type: GatewayType;
  ninerouter_base_url: string;
  has_ninerouter_api_key: boolean;
};

const DEFAULT_9ROUTER_URL = "http://localhost:20128/v1";

// 上游网关开关：TokenFree / 9Router 即插即用切换，保存后立即生效，无需重启
export function GatewaySwitchPanel({ onChanged }: { onChanged?: () => void }) {
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
      toast.error(err instanceof Error ? err.message : "加载上游网关失败");
    }
  }, []);

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
      toast.success("上游网关已保存");
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  if (!state) return null;
  const is9router = state.upstream_gateway_type === "9router";

  return (
    <SettingsPanel title={"上游网关"} description={"在 TokenFree 与 9Router 之间切换，保存后立即生效，无需重启。切换不会改动已保存的 TokenFree 配置。"}>
      <div className="settings-field-grid">
        <LabeledControl label={"当前上游"} className="settings-field-span-full">
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
              hint={state.has_ninerouter_api_key ? "已保存，留空不修改" : undefined}
              className="settings-field-span-full"
            >
              <input
                className="settings-input is-secret"
                type="password"
                placeholder={state.has_ninerouter_api_key ? "已保存，留空则不修改" : "sk-..."}
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
              />
              <p className="mt-1 text-xs text-[#909399]">{"使用 9Router 时不拉取官方价目与用量，计费估算仅供参考。"}</p>
            </LabeledControl>
          </>
        ) : null}
        <div className="settings-field-span-full">
          <button type="button" className="admin-btn admin-btn-primary" disabled={saving} onClick={() => void save(state)}>
            {saving ? "保存中…" : "保存并切换"}
          </button>
        </div>
      </div>
    </SettingsPanel>
  );
}
