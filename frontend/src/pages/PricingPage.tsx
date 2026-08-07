import AppShell from '../components/layout/AppShell'
import ComingSoon from '../components/ui/ComingSoon'

export default function PricingPage() {
  return (
    <AppShell active="pricing">
      <div className="pf-pricing">
        <h1 style={{ margin: 0, fontSize: '2rem' }}>定价</h1>
        <p className="pf-muted">套餐与额度体系规划中，当前创作额度不限。</p>
        <div className="pf-card">
          <ComingSoon label="定价方案即将推出" />
          <h2 style={{ margin: '1rem 0 0.5rem' }}>Free · 体验版</h2>
          <p className="pf-muted">免费使用基础模板与预览分辨率生成。</p>
          <ul style={{ textAlign: 'left', color: 'var(--pf-muted)', lineHeight: 1.8 }}>
            <li>知识科普模板</li>
            <li>分镜 / 配图 / 配音流水线</li>
            <li>成片下载（预览画质）</li>
            <li>
              高清导出、团队空间、平台一键分发 <ComingSoon />
            </li>
          </ul>
        </div>
      </div>
    </AppShell>
  )
}
