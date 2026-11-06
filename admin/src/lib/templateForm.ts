type TemplateDraft = {
  id: string; name: string; shot_duration_min: number; shot_duration_max: number; sort_order: number;
};

export function validateTemplateDraft(draft: TemplateDraft, creating: boolean) {
  const errors: Partial<Record<keyof TemplateDraft, string>> = {};
  if (creating && (!draft.id.trim() || draft.id.trim().length > 64)) errors.id = "Vui lòng nhập ID mẫu từ 1–64 ký tự";
  if (!draft.name.trim() || draft.name.trim().length > 128) errors.name = "Vui lòng nhập tên mẫu từ 1–128 ký tự";
  if (!Number.isSafeInteger(draft.shot_duration_min) || draft.shot_duration_min <= 0) errors.shot_duration_min = "Thời lượng ngắn nhất phải là số giây nguyên lớn hơn 0";
  if (!Number.isSafeInteger(draft.shot_duration_max) || draft.shot_duration_max <= 0) errors.shot_duration_max = "Thời lượng dài nhất phải là số giây nguyên lớn hơn 0";
  if (!errors.shot_duration_min && !errors.shot_duration_max && draft.shot_duration_max < draft.shot_duration_min) errors.shot_duration_max = "Thời lượng dài nhất không được nhỏ hơn thời lượng ngắn nhất";
  if (!Number.isSafeInteger(draft.sort_order)) errors.sort_order = "Giá trị sắp xếp phải là số nguyên";
  return errors;
}
