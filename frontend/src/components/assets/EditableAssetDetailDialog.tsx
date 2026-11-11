import { useTeamEditLock } from '../../features/teams/useTeamEditLock'
/** 资产详情操作框：预览图、上传/生图提示词编辑、生成/音色、形象历史版本 */
import { useEffect, useRef, useState } from 'react'
import { dramaApi, type DramaAsset } from '../../api/drama'
import { AssetDetailDialog } from './AssetDetailDialog'
import { readVisualPrompt } from '../../lib/dramaVisualPrompt'
import { dramaAssetHasImage } from '../../lib/dramaAssetImage'
import {
  formatAssetImageVersionLabel,
  readAssetImageVersions,
  resolveAssetImageVersionUrl,
} from '../../lib/dramaAssetImageVersions'
import { readAssetVoiceBinding } from '../../pages/drama/CharacterVoiceBindModal'
import { tv } from '../../i18n/tv'

type Props = {
  asset: DramaAsset
  open: boolean
  readOnly?: boolean
  busy?: boolean
  genLabel?: string
  onClose: () => void
  onUpdated: (asset: DramaAsset) => void
  onGenerate: (asset: DramaAsset) => void
  onBindVoice?: (asset: DramaAsset) => void
  onDelete?: (asset: DramaAsset) => void
  onError: (message: string) => void
}

// 将编辑后的提示词写回 params.visualPrompt
function buildPromptParams(asset: DramaAsset, prompt: string): Record<string, unknown> {
  const prev = (asset.params || {}) as Record<string, unknown>
  const kind = (asset.type || '').toLowerCase()
  const next: Record<string, unknown> = {
    ...prev,
    visualPrompt: prompt.trim(),
  }
  if (kind === 'character' || kind === 'scene') {
    next.visualImage = prompt.trim()
  }
  return next
}

// 渲染资产详情操作弹窗
export function EditableAssetDetailDialog({
  asset,
  open,
  readOnly = false,
  busy = false,
  genLabel = tv('生成形象', 'Tạo hình tượng'),
  onClose,
  onUpdated,
  onGenerate,
  onBindVoice,
  onDelete,
  onError,
}: Props) {
  /*
   * promptDraft 提示词草稿
   * saving 保存中
   * uploading 上传图片中
   * restoringVersionId 正在还原的版本
   * lightboxSrc 放大预览图 URL
   */
  const [promptDraft, setPromptDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)

  const hasImage = dramaAssetHasImage(asset)
  const voice = readAssetVoiceBinding(asset)
  const isCharacter = (asset.type || '').toLowerCase() === 'character'
  const isScene = (asset.type || '').toLowerCase() === 'scene'
  const isProp =
    (asset.type || '').toLowerCase() === 'prop' ||
    (asset.type || '').toLowerCase() === 'material'
  const deleteLabel = isScene ? tv('删除场景', 'Xóa bối cảnh') : isProp ? tv('删除道具', 'Xóa đạo cụ') : tv('删除角色', 'Xóa nhân vật')
  const canDelete = Boolean(onDelete) && (isCharacter || isScene || isProp)
  const dirty = promptDraft.trim() !== readVisualPrompt(asset).trim()
  const imageVersions = readAssetImageVersions(asset)
  const lock = useTeamEditLock({ projectId: asset.project_id, type: 'asset', resourceId: asset.id }, open && !readOnly, async (isCurrent) => { const rows = await dramaApi.listAssets(asset.project_id); const fresh = rows.find((item) => item.id === asset.id); if (!fresh) throw new Error(tv('资产已删除，请关闭后重新加载', 'Tài sản đã bị xóa, vui lòng đóng rồi tải lại')); if (isCurrent()) onUpdated(fresh) })
  const actionBusy = readOnly || lock.readOnly || busy || saving || uploading || Boolean(restoringVersionId)

  useEffect(() => {
    if (!open) return
    setPromptDraft(readVisualPrompt(asset))
    setLightboxSrc(null)
    setRestoringVersionId(null)
  }, [open, asset])

  // 保存提示词到资产 params
  async function savePrompt() {
    if (actionBusy) return
    const text = promptDraft.trim()
    if (!text) {
      onError(tv('提示词不能为空', 'Prompt không được để trống'))
      return
    }
    setSaving(true)
    try {
      const updated = await dramaApi.updateAsset(asset.id, {
        params: buildPromptParams(asset, text),
      })
      onUpdated(updated)
    } catch (err) {
      onError(err instanceof Error ? err.message : tv('保存提示词失败', 'Lưu prompt thất bại'))
    } finally {
      setSaving(false)
    }
  }

  // 先保存脏提示词再触发生图
  async function handleGenerate() {
    if (actionBusy) return
    if (dirty) {
      const text = promptDraft.trim()
      if (!text) {
        onError(tv('提示词不能为空', 'Prompt không được để trống'))
        return
      }
      setSaving(true)
      try {
        const updated = await dramaApi.updateAsset(asset.id, {
          params: buildPromptParams(asset, text),
        })
        onUpdated(updated)
        onGenerate(updated)
      } catch (err) {
        onError(err instanceof Error ? err.message : tv('保存提示词失败', 'Lưu prompt thất bại'))
      } finally {
        setSaving(false)
      }
      return
    }
    onGenerate(asset)
  }

  // 本地上传图片，视为已出图
  async function handleUpload(file: File) {
    if (actionBusy) return
    setUploading(true)
    try {
      const updated = await dramaApi.uploadAssetMedia(asset.id, file)
      onUpdated(updated)
    } catch (err) {
      onError(err instanceof Error ? err.message : tv('上传失败', 'Tải lên thất bại'))
    } finally {
      setUploading(false)
      if (uploadInputRef.current) uploadInputRef.current.value = ''
    }
  }

  // 将历史形象还原为当前
  async function handleRestoreVersion(versionId: string) {
    if (actionBusy) return
    setRestoringVersionId(versionId)
    try {
      const updated = await dramaApi.activateAssetImageVersion(asset.id, versionId)
      onUpdated(updated)
    } catch (err) {
      onError(err instanceof Error ? err.message : tv('还原失败', 'Khôi phục thất bại'))
    } finally {
      setRestoringVersionId(null)
    }
  }

  // 媒体详情保持统一，当前业务仅提供编辑与历史操作。
  const history = imageVersions.find((item) => resolveAssetImageVersionUrl(item) === lightboxSrc)
  return <>
    <AssetDetailDialog
      asset={asset}
      open={open}
      onClose={onClose}
      notice={readOnly ? <p className="drama-muted" role="status">{tv("只读查看", "Chỉ xem")}</p> : lock.readOnly ? <p className="pf-team-alert" role="status">{lock.checking ? tv('正在取得编辑占用…', 'Đang lấy quyền chỉnh sửa…') : lock.error}<button type="button" onClick={lock.retry}>{tv("重新尝试", "Thử lại")}</button></p> : undefined}
      actions={!readOnly && <button type="button" className="pf-btn pf-btn-lime" disabled={actionBusy || !promptDraft.trim()} onClick={() => void handleGenerate()}>{busy ? tv('生成中…', 'Đang tạo…') : genLabel}</button>}
    >
      {!readOnly && <details className="pf-asset-detail-editor">
        <summary>{tv("编辑下次生成的提示词", "Chỉnh prompt cho lần tạo tiếp theo")}</summary>
        <label><span className="sr-only">{tv("生图提示词", "Prompt tạo ảnh")}</span><textarea rows={5} value={promptDraft} readOnly={lock.readOnly} onChange={(event) => setPromptDraft(event.target.value)} placeholder={tv("描述外观、构图、光影与风格…", "Mô tả ngoại hình, bố cục, ánh sáng và phong cách…")} /></label>
        <div className="pf-asset-detail-edit-actions">
          <button type="button" className="pf-btn pf-btn-sm" disabled={saving || !dirty || actionBusy} onClick={() => void savePrompt()}>{saving ? tv('保存中…', 'Đang lưu…') : tv('保存提示词', 'Lưu prompt')}</button>
        </div>
      </details>}
      {!readOnly && <div className="pf-asset-detail-edit-actions">
        <input ref={uploadInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" disabled={actionBusy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleUpload(file) }} />
        <button type="button" className="pf-btn pf-btn-sm" disabled={actionBusy} onClick={() => uploadInputRef.current?.click()}>{uploading ? tv('上传中…', 'Đang tải lên…') : hasImage ? tv('更换图片', 'Đổi ảnh') : tv('上传图片', 'Tải ảnh lên')}</button>
        {isCharacter && onBindVoice && <button type="button" className="pf-btn pf-btn-sm" disabled={actionBusy} onClick={() => onBindVoice(asset)}>{voice ? tv('更换音色', 'Đổi giọng nói') : tv('绑定音色', 'Gắn giọng nói')}</button>}
        {canDelete && <button type="button" className="pf-btn pf-btn-sm drama-btn-danger-text" disabled={actionBusy} onClick={() => onDelete?.(asset)}>{deleteLabel}</button>}
      </div>}
      {imageVersions.length > 0 && <details className="pf-asset-detail-history">
        <summary>{tv("历史版本 ·", "Phiên bản lịch sử ·")} {imageVersions.length} {tv("个", "")}</summary>
        <ul className="pf-asset-detail-versions">{imageVersions.map((version) => <li key={version.id}>
          <button type="button" className="pf-asset-detail-version-thumb" title={tv("查看历史版本详情", "Xem chi tiết phiên bản lịch sử")} onClick={() => setLightboxSrc(resolveAssetImageVersionUrl(version))}><img src={resolveAssetImageVersionUrl(version)} alt="" /></button>
          <div className="pf-asset-detail-version-info"><span>{formatAssetImageVersionLabel(version)}</span>{version.createdAt && <small>{version.createdAt.replace('T', ' ').slice(0, 16)}</small>}</div>
          {!readOnly && <button type="button" className="pf-btn pf-btn-sm" disabled={actionBusy} onClick={() => void handleRestoreVersion(version.id)}>{restoringVersionId === version.id ? tv('还原中…', 'Đang khôi phục…') : tv('还原', 'Khôi phục')}</button>}
        </li>)}</ul>
      </details>}
    </AssetDetailDialog>
    {lightboxSrc && <AssetDetailDialog asset={{ ...asset, name: tv(`${asset.name || '资产'} · 历史版本`, `${asset.name || '资产'} · Phiên bản lịch sử`), cover: lightboxSrc, url: lightboxSrc, references: undefined, params: { media_metadata: history?.mediaMetadata || { source: 'unknown' } } }} onClose={() => setLightboxSrc(null)} />}
  </>
}
