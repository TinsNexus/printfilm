import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Modal from './Modal'

type Tab = 'guide' | 'faq' | 'tools'

type Props = {
  open: boolean
  onClose: () => void
}

const GUIDE_STEPS = [
  {
    n: '01',
    title: '选产品入口',
    body: '工作台进入「AI 漫剧」或「科普视频」；也可从顶栏「漫剧 / 科普」直达。',
  },
  {
    n: '02',
    title: '配置并生成',
    body: '漫剧：创意 → 大纲 → 资产 → 分集；科普：主题 → 风格 → 分镜 → 成片。',
  },
  {
    n: '03',
    title: '审阅与迭代',
    body: '单镜可重绘、重生视频或重配音，不必整片重做。',
  },
  {
    n: '04',
    title: '合成与下载',
    body: '成片完成后在资产/历史中预览、下载或继续编辑。',
  },
]

const FAQ_ITEMS = [
  {
    q: '第一次使用从哪开始？',
    a: '打开工作台，选「AI 漫剧」或「科普视频」。漫剧适合分集叙事，科普适合短视频流水线。',
  },
  {
    q: '「AI 视频」和「静图成片」有什么区别？',
    a: 'AI 视频动态更强、成本更高；静图成片更快更稳，适合图文科普。',
  },
  {
    q: '生成中可以离开页面吗？',
    a: '可以。任务在后台继续，回到资产或对应项目即可查看进度。',
  },
  {
    q: '成片在哪里下载？',
    a: '项目完成后，在资产（历史）列表可下载成片；也可多选打包下载。',
  },
]

const CATEGORIES = [
  { id: 'guide' as const, title: '快速开始', desc: '四步上手创作' },
  { id: 'faq' as const, title: '创作流程', desc: '漫剧与科普怎么走' },
  { id: 'tools' as const, title: '工具说明', desc: '文生图等即将开放' },
]

export default function HelpCenter({ open, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('guide')
  const [openFaq, setOpenFaq] = useState<number | null>(0)
  const [q, setQ] = useState('')

  const faqFiltered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return FAQ_ITEMS
    return FAQ_ITEMS.filter((item) => item.q.toLowerCase().includes(needle) || item.a.toLowerCase().includes(needle))
  }, [q])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="帮助中心"
      variant="drawer"
      className="pf-help-modal"
      footer={
        <>
          <Link to="/" className="pf-btn pf-btn-ghost pf-btn-sm" onClick={onClose}>
            回工作台
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
            {GUIDE_STEPS.map((s) => (
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
                    <span className="pf-help-faq-chev" aria-hidden>
                      {expanded ? '−' : '+'}
                    </span>
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
            <p>文生图、图生图、文生视频等工具中心已预留入口，能力上线后可在「工具」页使用。</p>
            <Link to="/tools" className="pf-btn pf-btn-ghost pf-btn-sm" onClick={onClose}>
              查看工具中心
            </Link>
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
