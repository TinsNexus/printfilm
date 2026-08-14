import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Modal from './Modal'
import {
  HELP_FAQ_ITEMS,
  HELP_GUIDE_STEPS,
  filterHelpFaq,
} from '../../lib/helpContent'

type Tab = 'guide' | 'faq' | 'tools'

type Props = {
  open: boolean
  onClose: () => void
}

const CATEGORIES = [
  { id: 'guide' as const, title: '快速开始', desc: '四步上手创作' },
  { id: 'faq' as const, title: '常见问题', desc: '下载 · 生成 · 充值' },
  { id: 'tools' as const, title: '工具说明', desc: '文生图与短视频' },
]

/** 帮助中心抽屉（与 /help 页共用文案） */
export default function HelpCenter({ open, onClose }: Props) {
  /*
   * tab 当前分区
   * openFaq 展开的 FAQ
   * q 搜索词
   */
  const [tab, setTab] = useState<Tab>('guide')
  const [openFaq, setOpenFaq] = useState<number | null>(0)
  const [q, setQ] = useState('')

  const faqFiltered = useMemo(() => filterHelpFaq(HELP_FAQ_ITEMS, q), [q])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="帮助中心"
      variant="drawer"
      className="pf-help-modal"
      footer={
        <>
          <Link to="/help" className="pf-btn pf-btn-ghost pf-btn-sm" onClick={onClose}>
            完整帮助页
          </Link>
          <button type="button" className="pf-btn pf-btn-lime pf-btn-sm" onClick={onClose}>
            知道了
          </button>
        </>
      }
    >
      <div className="pf-help">
        <label className="pf-help-search">
          <span className="sr-only">搜索帮助</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索指南或常见问题"
          />
        </label>

        <div className="pf-help-cats">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`pf-help-cat${tab === c.id ? ' is-active' : ''}`}
              onClick={() => setTab(c.id)}
            >
              <strong>{c.title}</strong>
              <span>{c.desc}</span>
            </button>
          ))}
        </div>

        {tab === 'guide' ? (
          <ol className="pf-help-steps">
            {HELP_GUIDE_STEPS.map((s) => (
              <li key={s.n}>
                <span className="pf-help-step-n" aria-hidden>
                  {s.n}
                </span>
                <div>
                  <strong>{s.title}</strong>
                  <p>{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        ) : null}

        {tab === 'faq' ? (
          <div className="pf-help-faq">
            {faqFiltered.map((item, i) => {
              const expanded = openFaq === i
              return (
                <div key={item.q} className={`pf-help-faq-item${expanded ? ' open' : ''}`}>
                  <button
                    type="button"
                    className="pf-help-faq-q"
                    aria-expanded={expanded}
                    onClick={() => setOpenFaq(expanded ? null : i)}
                  >
                    <span>{item.q}</span>
                    <span className="pf-help-faq-chev" aria-hidden />
                  </button>
                  {expanded ? <p className="pf-help-faq-a">{item.a}</p> : null}
                </div>
              )
            })}
            {faqFiltered.length === 0 ? <p className="pf-muted">没有匹配的问题</p> : null}
          </div>
        ) : null}

        {tab === 'tools' ? (
          <div className="pf-help-tools-note">
            <p>
              工具中心已开放文生图、图生图、图生产品、文生视频、视频生视频与电商拼图。生成结果会保存到云端，并在个人中心「工具创作」中支持查看与下载。
            </p>
            <div className="pf-help-tools-actions">
              <Link to="/tools" className="pf-btn pf-btn-lime pf-btn-sm" onClick={onClose}>
                打开工具
              </Link>
              <Link to="/settings?tab=tools" className="pf-btn pf-btn-ghost pf-btn-sm" onClick={onClose}>
                创作记录
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
