import { dialog } from './dialog'

/** 是否为余额不足 / 计费拦截类错误 */
export function isBillingError(message: string) {
  return /余额不足|请先充值|402/.test(message)
}

/**
 * 弹出余额不足提示；若用户选择去充值则跳转定价页。
 * @returns 是否已按计费错误处理
 */
export async function handleBillingError(
  err: unknown,
  navigate?: (path: string) => void,
): Promise<boolean> {
  const message = err instanceof Error ? err.message : String(err || '')
  if (!isBillingError(message)) return false
  const go = await dialog.confirm({
    title: '余额不足',
    message: message || '当前余额不足以开始生成，请先充值。',
    confirmText: '去充值',
    cancelText: '知道了',
    tone: 'danger',
  })
  if (go && navigate) navigate('/pricing')
  return true
}
