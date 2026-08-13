/** 分集编辑右侧：分段视频预览 + 入口打开全屏分镜画布 */
import type { DramaFragment } from '../../api/drama'
import { DramaFragmentSegmentedVideoPlayer } from '../../components/drama/DramaFragmentSegmentedVideoPlayer'

type Props = {
  fragments: DramaFragment[]
  playingFragmentId: number | null
  onPlayingFragmentChange: (fragmentId: number) => void
  aspectRatio: string
  onOpenStoryboard: () => void
}

// 渲染分集右侧预览与画布入口
export function EpisodeEditSidePane({
  fragments,
  playingFragmentId,
  onPlayingFragmentChange,
  aspectRatio,
  onOpenStoryboard,
}: Props) {
  const hasSelection = playingFragmentId !== null

  return (
    <aside className="drama-ep-preview">
      <div className="drama-ep-side-tabs" role="tablist" aria-label="右侧面板">
        <button type="button" role="tab" aria-selected className="active">
          预览
        </button>
        <button type="button" role="tab" onClick={onOpenStoryboard}>
          画布
        </button>
      </div>

      {!hasSelection || fragments.length === 0 ? (
        <p className="drama-ep-empty">请选择底部分镜</p>
      ) : (
        <div className="drama-ep-preview-inner">
          <DramaFragmentSegmentedVideoPlayer
            fragments={fragments}
            playingFragmentId={playingFragmentId}
            onPlayingFragmentChange={onPlayingFragmentChange}
            aspectRatio={aspectRatio}
          />
          {!fragments.some((f) => f.video) && (
            <button type="button" className="drama-ep-open-canvas" onClick={onOpenStoryboard}>
              打开分镜画布
            </button>
          )}
        </div>
      )}
    </aside>
  )
}
