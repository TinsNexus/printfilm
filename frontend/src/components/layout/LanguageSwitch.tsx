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
            // 顶层常量里的 tv() 只在加载时取值，进出越南语时刷新页面使其生效
            if ((code === 'vi' || locale === 'vi') && typeof window !== 'undefined') window.location.reload()
          }}
        >
          {code === 'zh' ? t('nav.langZh') : code === 'vi' ? t('nav.langVi') : t('nav.langEn')}
        </button>
      ))}
    </div>
  )
}
