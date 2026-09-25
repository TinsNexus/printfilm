import { Fragment, type ReactNode } from 'react'

/**
 * 富文本插值：把译文里的 {name} 替换成 JSX（如 <strong>），其余按原文输出。
 * 用法：tRich(t('key'), { count: <strong>{n}</strong> })
 */
export function tRich(text: string, vars: Record<string, ReactNode>): ReactNode {
  return text.split(/(\{\w+\})/g).map((part, i) => {
    const name = /^\{(\w+)\}$/.exec(part)?.[1]
    return name && name in vars ? <Fragment key={i}>{vars[name]}</Fragment> : part
  })
}

/**
 * 轻量标记：译文里的 **粗体** 渲染为 <strong>，`代码` 渲染为 <code>，其余原样。
 * 用于说明文档类文案，让译者可以自由调整语序而不必拆成多段。
 */
export function tMarkup(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.length > 4 && part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>
    return part
  })
}
