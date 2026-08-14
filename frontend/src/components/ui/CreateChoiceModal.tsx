import { Link, useNavigate } from 'react-router-dom'
import { Clapperboard, Video } from 'lucide-react'
import Modal from './Modal'

type Props = {
  open: boolean
  onClose: () => void
}

/** 开始创作：在漫剧与科普之间选择入口 */
export default function CreateChoiceModal({ open, onClose }: Props) {
  const nav = useNavigate()

  // 跳转到目标产品并关闭弹层
  function go(path: string) {
    onClose()
    nav(path)
  }

  return (
    <Modal open={open} onClose={onClose} title="开始创作" size="md">
      <p className="pf-muted" style={{ marginTop: 0 }}>
        选择一个产品线，进入对应工作流
      </p>
      <div className="pf-create-choice">
        <button type="button" className="pf-create-choice-card" onClick={() => go('/drama')}>
          <span className="pf-ws-product-icon" aria-hidden>
            <Clapperboard size={24} strokeWidth={1.6} />
          </span>
          <strong>AI 漫剧</strong>
          <span className="pf-muted">剧本 · 分集 · 成片</span>
        </button>
        <button type="button" className="pf-create-choice-card" onClick={() => go('/studio/new')}>
          <span className="pf-ws-product-icon" aria-hidden>
            <Video size={24} strokeWidth={1.6} />
          </span>
          <strong>科普视频</strong>
          <span className="pf-muted">分镜流水线出片</span>
        </button>
      </div>
      <p className="pf-create-choice-foot">
        也可以先去 <Link to="/tools" onClick={onClose}>工具中心</Link> 浏览独立能力
      </p>
    </Modal>
  )
}
