import { LOCALES, type Locale } from '../../i18n/detect'
import { useI18n } from '../../i18n'

/** 顶栏中/英/越切换：点击后写入偏好，覆盖浏览器语言 */
export default function LanguageSwitch() {
  const { locale, setLocale, t } = useI18n()

  return (
    <div className="pf-nav-lang" role="group" aria-label={t('nav.language')}>
      {LOCALES.map((code: Locale) => (
        <button
          key={code}
          type="button"
          className={locale === code ? 'is-active' : undefined}
          aria-pressed={locale === code}
          onClick={() => {
            if (code === locale) return
            setLocale(code)
            // 模块级常量与未订阅 i18n 的组件只在加载/渲染时取文案：偏好已写入 localStorage，刷新页面让全站统一生效
            if (typeof window !== 'undefined') window.location.reload()
          }}
        >
          {code === 'zh' ? t('nav.langZh') : code === 'vi' ? t('nav.langVi') : t('nav.langEn')}
        </button>
      ))}
    </div>
  )
}
