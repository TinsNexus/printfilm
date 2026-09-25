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
