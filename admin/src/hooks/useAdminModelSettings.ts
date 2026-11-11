import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api, type AdminModelSettings } from "@/api/client";
import { tr } from "../i18n/translate.ts";

// 加载 / 保存管理端 flat 配置（DB 覆盖 env）
export function useAdminModelSettings() {
  const [form, setForm] = useState<AdminModelSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const pendingSave = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setForm(await api<AdminModelSettings>("/api/admin/settings/models"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("ui.couldLoadSettings"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function patchField<K extends keyof AdminModelSettings>(key: K, value: AdminModelSettings[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function save(body: Record<string, unknown>, successMessage = tr("ui.settingsSaved")): Promise<boolean> {
    if (pendingSave.current) return false;
    pendingSave.current = true;
    setSaving(true);
    try {
      await api("/api/admin/settings/models", { method: "PATCH", body: JSON.stringify(body) });
      await load();
      toast.success(successMessage);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("ui.saveFailed"));
      return false;
    } finally {
      pendingSave.current = false;
      setSaving(false);
    }
  }

  return { form, loading, saving, load, patchField, save };
}
