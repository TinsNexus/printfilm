/**
 * 分镜板多宫格拆分与路径 D 脚本组装（对齐 EPISODE_RULES / MapleShaw 路径 D）
 * D-1：≤4 格 → 单镜多段 @duration；D-2：≥5 格 → 每格一镜
 */

/** 禁止模型复刻网格 UI 的画面约束 */
export const STORYBOARD_NO_GRID_CUE =
  '【画面约束】不复刻分镜板的网格边框、格子编号与分隔线，仅演绎各格画面内容'

export type StoryboardGridCell = {
  index: number
  row: number
  col: number
  blob: Blob
  fileName: string
}

export type StoryboardImportMode = 'd1' | 'd2'

// 按格数选择 D-1 / D-2
export function resolveStoryboardImportMode(cellCount: number): StoryboardImportMode {
  return cellCount <= 4 ? 'd1' : 'd2'
}

// 将宫格图按 rows×cols 裁成独立单元格 Blob
export async function splitStoryboardGridImage(
  file: File,
  rows: number,
  cols: number,
): Promise<StoryboardGridCell[]> {
  const safeRows = Math.max(1, Math.min(6, Math.floor(rows)))
  const safeCols = Math.max(1, Math.min(6, Math.floor(cols)))
  const bitmap = await createImageBitmap(file)
  try {
    const cellW = Math.floor(bitmap.width / safeCols)
    const cellH = Math.floor(bitmap.height / safeRows)
    if (cellW < 8 || cellH < 8) {
      throw new Error('宫格过小，请换更高清分镜板或减少行列数')
    }
    const cells: StoryboardGridCell[] = []
    for (let row = 0; row < safeRows; row++) {
      for (let col = 0; col < safeCols; col++) {
        const canvas = document.createElement('canvas')
        canvas.width = cellW
        canvas.height = cellH
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('无法裁剪分镜板')
        ctx.drawImage(
          bitmap,
          col * cellW,
          row * cellH,
          cellW,
          cellH,
          0,
          0,
          cellW,
          cellH,
        )
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error('单元格导出失败'))),
            'image/jpeg',
            0.92,
          )
        })
        const index = cells.length
        cells.push({
          index,
          row,
          col,
          blob,
          fileName: `storyboard_r${row + 1}c${col + 1}.jpg`,
        })
      }
    }
    return cells
  } finally {
    bitmap.close()
  }
}

// D-1：单镜多段时间戳脚本（格图作参考，正文不写网格）
export function buildStoryboardD1Content(
  cellCount: number,
  durations: number[],
): string {
  const lines = [STORYBOARD_NO_GRID_CUE]
  for (let i = 0; i < cellCount; i++) {
    const sec = durations[i] ?? 4
    lines.push(`@duration:${sec}`)
    lines.push(
      `【画面·无配音仅环境音】按分镜板第 ${i + 1} 格画面演绎（从左到右、从上到下），主体动作连贯。`,
    )
  }
  return lines.join('\n')
}

// D-2：单格一镜的默认画面正文
export function buildStoryboardD2CellContent(
  cellIndex: number,
  durationSec: number,
): string {
  return [
    STORYBOARD_NO_GRID_CUE,
    `@duration:${durationSec}`,
    `【画面·无配音仅环境音】按分镜板第 ${cellIndex + 1} 格画面演绎，不复刻网格。`,
  ].join('\n')
}
