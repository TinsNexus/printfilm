import { dialog } from './dialog'
import { workspaceScope } from '../features/teams/workspaceScope'
import { tv } from '../i18n/tv'

export const PRICING_PATH = '/pricing'

/** 是否为余额不足 / 计费拦截类错误 */
export function isBillingError(message: string) {
  return /余额不足|请先充值|402|insufficient_balance/i.test(message)
}

/** 跳转定价页充值 */
export function goToTopup() {
  if (typeof window !== 'undefined') {
    window.location.assign(workspaceScope.teamId === null ? PRICING_PATH : `/teams/${workspaceScope.teamId}?tab=billing`)
  }
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
  if (workspaceScope.teamId !== null) {
    await dialog.alert({ title: tv('团队消费受限', 'Chi tiêu nhóm bị giới hạn'), message: tv(`${message}。请在团队钱包查看本人额度；团队余额与充值由所有者管理。`, `${message}. Vui lòng xem hạn mức của bạn trong ví nhóm; số dư và nạp tiền của nhóm do chủ sở hữu quản lý.`), confirmText: tv('知道了', 'Đã hiểu') })
    return true
  }
  const go = await dialog.confirm({
    title: tv('余额不足', 'Số dư không đủ'),
    message: message || tv('当前余额不足以开始生成，请先充值。', 'Số dư hiện tại không đủ để bắt đầu tạo, vui lòng nạp tiền trước.'),
    confirmText: tv('去充值', 'Đi nạp tiền'),
    cancelText: tv('知道了', 'Đã hiểu'),
    tone: 'danger',
  })
  if (go) {
    if (navigate) navigate(PRICING_PATH)
    else goToTopup()
  }
  return true
}

/**
 * API 层全局拦截：402 / 余额不足时弹出充值引导（不吞掉原错误）。
 */
export function notifyBillingErrorIfNeeded(status: number, message: string) {
  if (status === 402 || isBillingError(message)) {
    void handleBillingError(new Error(message))
  }
}
