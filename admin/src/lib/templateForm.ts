import { tr } from "../i18n/translate.ts";
type TemplateDraft = {
  id: string; name: string; shot_duration_min: number; shot_duration_max: number; sort_order: number;
};

export function validateTemplateDraft(draft: TemplateDraft, creating: boolean) {
  const errors: Partial<Record<keyof TemplateDraft, string>> = {};
  if (creating && (!draft.id.trim() || draft.id.trim().length > 64)) errors.id = tr("templates.ui.errId");
  if (!draft.name.trim() || draft.name.trim().length > 128) errors.name = tr("templates.ui.errName");
  if (!Number.isSafeInteger(draft.shot_duration_min) || draft.shot_duration_min <= 0) errors.shot_duration_min = tr("templates.ui.errDurMin");
  if (!Number.isSafeInteger(draft.shot_duration_max) || draft.shot_duration_max <= 0) errors.shot_duration_max = tr("templates.ui.errDurMax");
  if (!errors.shot_duration_min && !errors.shot_duration_max && draft.shot_duration_max < draft.shot_duration_min) errors.shot_duration_max = tr("templates.ui.errDurOrder");
  if (!Number.isSafeInteger(draft.sort_order)) errors.sort_order = tr("templates.ui.errSort");
  return errors;
}
