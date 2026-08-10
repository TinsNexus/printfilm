import { useState } from 'react'
import { Link } from 'react-router-dom'
import Modal from './Modal'

type Tab = 'guide' | 'faq'

type Props = {
  open: boolean
  onClose: () => void
}

const GUIDE_STEPS = [
  {
    n: '01',
    title: '选模板或输入主题',
    body: '在首页或「模板」挑一个风格，或到创作台直接写主题 / 粘贴完整文案。登录后即可开始。',
  },
  {
    n: '02',
    title: '配置风格与成片方式',
    body: '确认视觉风格、角色一致性、音色与画幅比例；选择「AI 视频」或「静图成片」。满意后点击生成。',
  },
  {
    n: '03',
    title: '审阅分镜并继续制作',
    body: '先看旁白与分镜标题是否准确。可点开单镜改文案与提示词，再继续生成画面、配音与视频。',
  },
  {
    n: '04',
    title: '合成、预览与发布',
    body: '全部镜头就绪后一键合成成片，预览无误即可发布到作品墙，或在「历史」里下载与继续编辑。',
  },
]

const FAQ_ITEMS = [
  {
    q: '第一次使用从哪开始？',
    a: '建议从首页「开始创作」进入：选一个模板 → 写主题 → 在风格页确认预设后生成。也可以先逛「模板」找灵感。',
  },
  {
    q: '「AI 视频」和「静图成片」有什么区别？',
    a: 'AI 视频会对镜头做动态生成，观感更强、耗时与成本更高；静图成片用高质量静帧配旁白合成，更快更稳，适合图文科普。',
  },
  {
    q: '生成中可以离开页面吗？',
    a: '可以。任务在后台继续跑，回到「历史」或打开对应项目即可查看进度。生成中请勿重复点「推倒重做」，除非你要清空重来。',
  },
  {
    q: '某一镜画面 / 旁白不满意怎么办？',
    a: '在分镜工作台选中该镜：可改旁白与提示词，再单独「重绘」「重生视频」或「重配音」，不必整片重做。',
  },
  {
    q: '为什么旁白和画面时长对不上？',
    a: '合成时会尽量以旁白时长为准，并对较短的视频镜头做定格补齐。若仍觉得偏短，可略加长该镜旁白或提高镜头目标时长后重配音。',
  },
  {
    q: '成片在哪里下载？',
    a: '项目状态为「已完成」后，在「历史」列表可单独下载成片；勾选多个项目后点「打包下载」，由浏览器依次拉取并打成 ZIP，不经过服务器中转。',
  },
  {
    q: '需要角色始终同一人吗？',
    a: '部分模板会锁定角色形象；科普 / 开源展示等模板更偏风格或内容多样，可在风格页查看与调整角色提示词。',
  },
  {
    q: '登录后数据会丢吗？',
    a: '项目保存在你的账号下，可在「历史」随时找回。删除项目会清除素材与成片，操作前会二次确认。',
  },
]

export default function HelpCenter({ open, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('guide')
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="帮助中心"
      variant="drawer"
      className="pf-help-modal"
      footer={
        <>
          <Link to="/studio/new" className="pf-btn pf-btn-ghost pf-btn-sm" onClick={onClose}>
            去创作台
          </Link>
          <button type="button" className="pf-btn pf-btn-lime pf-btn-sm" onClick={onClose}>
            知道了
          </button>
        </>
      }
    >
      <div className="pf-help">
        <p className="pf-help-lede">
          从主题到成片的快速指南，以及创作时最常遇到的问题。
        </p>

        <div className="pf-help-tabs" role="tablist" aria-label="帮助分类">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'guide'}
            className={tab === 'guide' ? 'active' : undefined}
            onClick={() => setTab('guide')}
          >
            操作指南
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'faq'}
            className={tab === 'faq' ? 'active' : undefined}
            onClick={() => setTab('faq')}
          >
            常见问题
          </button>
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
        ) : (
          <div className="pf-help-faq">
            {FAQ_ITEMS.map((item, i) => {
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
          </div>
        )}
      </div>
    </Modal>
  )
}
