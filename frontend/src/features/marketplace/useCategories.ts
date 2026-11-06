import { useEffect, useState } from 'react'
import { request } from './api'
import { tv } from '../../i18n/tv'

export function useCategories() {
  const [names, setNames] = useState<string[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    request<{ names: string[] }>('/categories').then(value => { if (active) setNames(value.names) })
      .catch(e => { if (active) setError(tv(`分类加载失败：${e.message}，请刷新重试。`, `Tải danh mục thất bại: ${e.message}, vui lòng làm mới và thử lại.`)) })
    return () => { active = false }
  }, [])
  return { names, error }
}
