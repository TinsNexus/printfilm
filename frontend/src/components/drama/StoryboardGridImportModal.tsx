/** 分镜板多宫格导入：裁格 → 上传素材 → D-1 单镜多段 / D-2 每格一镜 */
import { useMemo, useState } from 'react'
import Modal from '../../components/ui/Modal'
import { dramaApi, type DramaAsset, type DramaFragment } from '../../api/drama'
import {
  DRAMA_EDIT_RHYTHM_PRESETS,
  suggestEpisodeFragmentDurations,
  suggestRhythmDurations,
  type DramaEditRhythmId,
} from '../../lib/dramaEditRhythm'
import {
  buildStoryboardD1Content,
  buildStoryboardD2CellContent,
  resolveStoryboardImportMode,
  splitStoryboardGridImage,
} from '../../lib/dramaStoryboardGrid'

type Props = {
  open: boolean
  onClose: () => void
  projectId: number
  episodeId: number
  fragments: DramaFragment[]
  onImported: (next: DramaFragment[], assets: DramaAsset[]) => void
}

// 分镜板导入弹窗
export function StoryboardGridImportModal({
  open,
  onClose,
  projectId,
  episodeId,
  fragments,
  onImported,
}: Props) {
  /*
   * file 宫格图
   * rows / cols 行列
   * rhythmId 节奏公式
   * busy / error / previewMode 状态
   */
  const [file, setFile] = useState<File | null>(null)
  const [rows, setRows] = useState(2)
  const [cols, setCols] = useState(2)
  const [rhythmId, setRhythmId] = useState<DramaEditRhythmId>('breath')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const cellCount = rows * cols
  const mode = useMemo(() => resolveStoryboardImportMode(cellCount), [cellCount])
  const previewDurations = useMemo(
    () =>
      mode === 'd1'
        ? suggestRhythmDurations(cellCount, rhythmId, Math.min(15, 4 * cellCount))
        : suggestEpisodeFragmentDurations(cellCount, rhythmId, 10),
    [cellCount, mode, rhythmId],
  )

  // 执行导入
  async function handleImport() {
    if (!file) {
      setError('请先选择分镜板图片')
      return
    }
    setBusy(true)
    setError('')
    try {
      const cells = await splitStoryboardGridImage(file, rows, cols)
      const uploaded: DramaAsset[] = []
      for (const cell of cells) {
        const stub = await dramaApi.createAsset({
          project_id: projectId,
          type: 'material',
          asset_type: 'material',
          name: `分镜板 ${cell.row + 1}-${cell.col + 1}`,
          params: {
            storyboardCell: true,
            cellIndex: cell.index,
            source: 'storyboard_grid_import',
          },
        })
        const media = new File([cell.blob], cell.fileName, { type: 'image/jpeg' })
        const done = await dramaApi.uploadAssetMedia(stub.id, media)
        uploaded.push(done)
      }

      const durations = previewDurations
      let nextFragments: DramaFragment[]

      if (mode === 'd1') {
        const cover = uploaded[0]?.cover || uploaded[0]?.url || ''
        const assetIds = uploaded.map((a) => a.id)
        const content = buildStoryboardD1Content(cells.length, durations)
        const base = fragments[0]
        nextFragments = [
          {
            id: base?.id || 0,
            episode_id: episodeId,
            sort_order: 0,
            content,
            cover,
            video: '',
            duration_sec: durations.reduce((a, b) => a + b, 0),
            asset_ids: assetIds,
            params: {
              ...(base?.params && typeof base.params === 'object' ? base.params : {}),
              storyboardImport: 'd1',
              rhythmId,
              user_edited: true,
            },
          },
          ...fragments.slice(1).map((f, i) => ({ ...f, sort_order: i + 1 })),
        ]
      } else {
        nextFragments = uploaded.map((asset, index) => {
          const sec = durations[index] ?? 8
          return {
            id: 0,
            episode_id: episodeId,
            sort_order: index,
            content: buildStoryboardD2CellContent(index, sec),
            cover: asset.cover || asset.url || '',
            video: '',
            duration_sec: sec,
            asset_ids: [asset.id],
            params: {
              storyboardImport: 'd2',
              rhythmId,
              cellIndex: index,
              user_edited: true,
            },
          }
        })
      }

      const saved = await dramaApi.saveFragments(
        episodeId,
        nextFragments.map((f, i) => ({
          sort_order: i,
          content: f.content,
          cover: f.cover,
          video: f.video || '',
          duration_sec: f.duration_sec ?? 8,
          params: f.params || {},
          asset_ids: f.asset_ids || [],
        })),
      )
      onImported(saved.fragments || [], uploaded)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title="导入分镜板（多宫格）"
      size="lg"
      className="pf-help-modal"
      footer={
        <>
          <button type="button" className="pf-btn pf-btn-ghost pf-btn-sm" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="pf-btn pf-btn-lime pf-btn-sm"
            disabled={busy || !file}
            onClick={() => void handleImport()}
          >
            {busy ? '导入中…' : mode === 'd1' ? '导入为单镜多段' : '导入为多镜'}
          </button>
        </>
      }
    >
      <div className="drama-storyboard-import">
        <p className="drama-storyboard-import-lede">
          上传 N 宫格分镜板。≤4 格走 D-1（单镜时间戳）；≥5 格走 D-2（每格一镜）。生成时会注入「不复刻网格」约束。
        </p>

        <label className="drama-storyboard-import-file">
          <span>分镜板图片</span>
          <input
            type="file"
            accept="image/*"
            disabled={busy}
            onChange={(e) => {
              setFile(e.target.files?.[0] || null)
              setError('')
            }}
          />
        </label>

        <div className="drama-storyboard-import-row">
          <label>
            行
            <input
              type="number"
              min={1}
              max={6}
              value={rows}
              disabled={busy}
              onChange={(e) => setRows(Number(e.target.value) || 1)}
            />
          </label>
          <label>
            列
            <input
              type="number"
              min={1}
              max={6}
              value={cols}
              disabled={busy}
              onChange={(e) => setCols(Number(e.target.value) || 1)}
            />
          </label>
          <em>
            {cellCount} 格 · {mode === 'd1' ? 'D-1 单镜多段' : 'D-2 每格一镜'}
          </em>
        </div>

        <div className="drama-storyboard-import-rhythm">
          <strong>剪辑节奏</strong>
          <div className="drama-storyboard-import-rhythm-chips">
            {DRAMA_EDIT_RHYTHM_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={rhythmId === preset.id ? 'is-active' : undefined}
                disabled={busy}
                title={preset.hint}
                onClick={() => setRhythmId(preset.id)}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <p>
            建议时长：{previewDurations.map((s) => `${s}s`).join(' · ')}
            {mode === 'd2' ? '（将写入各镜）' : '（写入本镜各段）'}
          </p>
        </div>

        {mode === 'd2' ? (
          <p className="drama-storyboard-import-warn">
            D-2 会用新分镜替换本集现有分镜列表（原视频会被清空，请确认后导入）。
          </p>
        ) : (
          <p className="drama-storyboard-import-note">
            D-1 会改写第 1 镜脚本与封面，并挂上各格素材参考；其余分镜保留。
          </p>
        )}

        {error ? <p className="drama-storyboard-import-error">{error}</p> : null}
      </div>
    </Modal>
  )
}
