/** 分集脚本编辑器：inline 时长/资产标签渲染与序列化 */
export type DramaMentionChipData = {
  assetId: number
  label: string
  previewUrl: string | null
}

export const DURATION_CHIP_SELECTOR = '[data-duration-sec]'
export const MENTION_CHIP_SELECTOR = "[data-mention='true']"
export const CONTENT_TOKEN_PATTERN = /@(asset:\d+|duration:\d+)/g
export const DURATION_PRESET_OPTIONS = [5, 10, 15, 30] as const
export const FRAGMENT_CONTENT_DURATION_MAX = 30

const BLOCK_ELEMENT_TAGS = new Set(['DIV', 'P'])

export type MentionCaretRect = {
  top: number
  left: number
  bottom: number
}

// 场记板图标（内联 SVG，避免依赖 react-dom/server）
function createClapperboardIconElement() {
  const iconWrap = document.createElement('span')
  iconWrap.className = 'drama-ep-chip-icon'
  iconWrap.setAttribute('aria-hidden', 'true')
  iconWrap.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z"/><path d="m6.2 5.3 3.1 3.9"/><path d="m12.4 3.4 3.1 4"/><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>'
  return iconWrap
}

// 判断节点是否位于引用标签内部
function isInsideMentionChip(node: Node | null) {
  if (!node) return false
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
  return Boolean(element?.closest(MENTION_CHIP_SELECTOR))
}

// 将含换行符的文本追加为 Text + <br>
function appendTextWithLineBreaks(root: HTMLElement, text: string) {
  const parts = text.split('\n')
  parts.forEach((part, index) => {
    if (part) root.appendChild(document.createTextNode(part))
    if (index < parts.length - 1) root.appendChild(document.createElement('br'))
  })
}

// 创建 inline 资产引用标签
export function createMentionChipElement(chip: DramaMentionChipData) {
  const chipEl = document.createElement('span')
  chipEl.className = 'drama-ep-mention-chip drama-ep-editor-chip'
  chipEl.contentEditable = 'false'
  chipEl.dataset.mention = 'true'
  chipEl.dataset.assetId = String(chip.assetId)

  const thumbEl = document.createElement('span')
  thumbEl.className = 'drama-ep-mention-chip-thumb'
  if (chip.previewUrl) {
    const image = document.createElement('img')
    image.src = chip.previewUrl
    image.alt = chip.label
    image.draggable = false
    thumbEl.appendChild(image)
  } else {
    thumbEl.className += ' is-fallback'
    thumbEl.textContent = chip.label[0] || '资'
  }
  chipEl.appendChild(thumbEl)

  const labelEl = document.createElement('span')
  labelEl.className = 'drama-ep-mention-chip-label'
  labelEl.textContent = chip.label
  chipEl.appendChild(labelEl)
  return chipEl
}

// 创建 inline 时长标签
export function createDurationChipElement(seconds: number) {
  const chipEl = document.createElement('span')
  chipEl.className = 'drama-ep-duration-chip drama-ep-editor-chip'
  chipEl.contentEditable = 'false'
  chipEl.dataset.mention = 'true'
  chipEl.dataset.durationSec = String(seconds)

  const labelEl = document.createElement('span')
  labelEl.dataset.durationLabel = 'true'
  labelEl.textContent = `${seconds}s`

  chipEl.appendChild(createClapperboardIconElement())
  chipEl.appendChild(labelEl)
  return chipEl
}

// 更新已有时长标签秒数
export function updateDurationChipElement(chipEl: HTMLElement, seconds: number) {
  chipEl.dataset.durationSec = String(seconds)
  const labelEl = chipEl.querySelector<HTMLElement>('[data-duration-label]')
  if (labelEl) labelEl.textContent = `${seconds}s`
}

// 在 Range 处插入时长标签
export function insertDurationChipAtRange(range: Range, seconds: number) {
  const selection = window.getSelection()
  range.deleteContents()
  const chipEl = createDurationChipElement(seconds)
  const trailingSpace = document.createTextNode(' ')
  range.insertNode(trailingSpace)
  range.insertNode(chipEl)
  if (!selection) return
  const caretRange = document.createRange()
  caretRange.setStartAfter(trailingSpace)
  caretRange.collapse(true)
  selection.removeAllRanges()
  selection.addRange(caretRange)
}

// 在 Range 处插入纯文本（运镜/景别前缀等）
export function insertPlainTextAtRange(range: Range, text: string) {
  const selection = window.getSelection()
  range.deleteContents()
  const node = document.createTextNode(text)
  range.insertNode(node)
  if (!selection) return
  const caretRange = document.createRange()
  caretRange.setStartAfter(node)
  caretRange.collapse(true)
  selection.removeAllRanges()
  selection.addRange(caretRange)
}

// 在 Range 处插入资产标签
export function insertMentionChipAtRange(range: Range, chip: DramaMentionChipData) {
  const selection = window.getSelection()
  range.deleteContents()
  const chipEl = createMentionChipElement(chip)
  const trailingSpace = document.createTextNode(' ')
  range.insertNode(trailingSpace)
  range.insertNode(chipEl)
  if (!selection) return
  const caretRange = document.createRange()
  caretRange.setStartAfter(trailingSpace)
  caretRange.collapse(true)
  selection.removeAllRanges()
  selection.addRange(caretRange)
}

// 将编辑器 DOM 序列化为 content 字符串
export function serializePromptEditorContent(root: HTMLElement) {
  let result = ''

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (isInsideMentionChip(node)) return
      result += node.textContent ?? ''
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const element = node as HTMLElement
    if (element.tagName === 'BR') {
      result += '\n'
      return
    }
    if (element.dataset.mention === 'true' && element.dataset.durationSec) {
      result += `@duration:${element.dataset.durationSec}`
      return
    }
    if (element.dataset.mention === 'true' && element.dataset.assetId) {
      result += `@asset:${element.dataset.assetId}`
      return
    }
    if (BLOCK_ELEMENT_TAGS.has(element.tagName) && element !== root) {
      if (result.length > 0 && !result.endsWith('\n')) result += '\n'
      element.childNodes.forEach((child) => walk(child))
      return
    }
    element.childNodes.forEach((child) => walk(child))
  }

  root.childNodes.forEach((child) => walk(child))
  return result
}

// 根据 content 渲染编辑器 DOM
export function renderPromptEditorContent(
  root: HTMLElement,
  content: string,
  resolveChip: (assetId: number) => DramaMentionChipData | null,
) {
  root.replaceChildren()
  if (!content) return

  let lastIndex = 0
  for (const match of content.matchAll(CONTENT_TOKEN_PATTERN)) {
    const matchIndex = match.index ?? 0
    const token = match[1]
    if (matchIndex > lastIndex) {
      appendTextWithLineBreaks(root, content.slice(lastIndex, matchIndex))
    }
    if (token.startsWith('duration:')) {
      const seconds = Number(token.slice('duration:'.length))
      if (Number.isFinite(seconds) && seconds > 0) {
        root.appendChild(createDurationChipElement(seconds))
      } else {
        appendTextWithLineBreaks(root, match[0])
      }
    } else if (token.startsWith('asset:')) {
      const assetId = Number(token.slice('asset:'.length))
      const chipData = resolveChip(assetId)
      if (chipData) root.appendChild(createMentionChipElement(chipData))
      else appendTextWithLineBreaks(root, match[0])
    } else {
      appendTextWithLineBreaks(root, match[0])
    }
    lastIndex = matchIndex + match[0].length
  }
  if (lastIndex < content.length) {
    appendTextWithLineBreaks(root, content.slice(lastIndex))
  }
}

// 从 selection 解析 @ 触发
export function detectMentionTriggerFromSelection(root: HTMLElement) {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  const anchorNode = selection.anchorNode
  if (
    !anchorNode ||
    !root.contains(anchorNode) ||
    anchorNode.nodeType !== Node.TEXT_NODE ||
    isInsideMentionChip(anchorNode)
  ) {
    return null
  }
  const textNode = anchorNode as Text
  const textBefore = textNode.textContent?.slice(0, selection.anchorOffset) ?? ''
  const match = textBefore.match(/@([^\s@]*)$/)
  if (!match || match.index === undefined) return null
  const triggerRange = document.createRange()
  triggerRange.setStart(textNode, match.index)
  triggerRange.setEnd(textNode, selection.anchorOffset)
  return { query: match[1], range: triggerRange }
}

// 获取光标屏幕坐标
export function getCaretClientRect(): MentionCaretRect | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0).cloneRange()
  range.collapse(true)
  const rects = range.getClientRects()
  if (rects.length > 0) {
    const rect = rects[rects.length - 1]
    return { top: rect.top, left: rect.left, bottom: rect.bottom }
  }
  const marker = document.createElement('span')
  marker.textContent = '\u200b'
  range.insertNode(marker)
  const rect = marker.getBoundingClientRect()
  marker.parentNode?.removeChild(marker)
  selection.removeAllRanges()
  selection.addRange(range)
  return { top: rect.top, left: rect.left, bottom: rect.bottom }
}

// 统计 content 中 @duration 合计秒数
export function sumContentDurationSeconds(content: string) {
  let total = 0
  const re = /@duration:(\d+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(content))) {
    const sec = Number(m[1])
    if (Number.isFinite(sec) && sec > 0) total += sec
  }
  return total
}

// 从 DramaAsset 构建 chip 数据
export function resolveChipFromAsset(
  asset: { id: number; name?: string | null; cover?: string | null; url?: string | null },
  previewUrl: string,
): DramaMentionChipData {
  return {
    assetId: asset.id,
    label: asset.name || `资产 ${asset.id}`,
    previewUrl: previewUrl || null,
  }
}
