import { LOCALES, type Locale } from '../../i18n/detect'
import { useI18n } from '../../i18n'

// 各语言按钮文案的 i18n 键
const LOCALE_LABEL_KEY: Record<Locale, string> = { zh: 'nav.langZh', en: 'nav.langEn', vi: 'nav.langVi' }

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
          onClick={() => setLocale(code)}
        >
          {t(LOCALE_LABEL_KEY[code])}
        </button>
      ))}
    </div>
  )
}
