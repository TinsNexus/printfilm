/** Agent Skill 多选列表（弹窗 / 画布下拉共用） */
import { useRef } from 'react'
import type { AgentSkill } from '../../api/agentSkills'

type AgentSkillPickerProps = {
  skills: AgentSkill[]
  selectedIds: number[]
  onToggle: (skillId: number) => void
  onSelectAll?: () => void
  onSelectNone?: () => void
  onUpload?: (file: File) => void
  uploading?: boolean
  uploadError?: string
  emptyText?: string
  compact?: boolean
}

/** 渲染 Skill 勾选列表，可上传 .md */
export function AgentSkillPicker({
  skills,
  selectedIds,
  onToggle,
  onSelectAll,
  onSelectNone,
  onUpload,
  uploading = false,
  uploadError = '',
  emptyText = '暂无可用 Skill',
  compact = false,
}: AgentSkillPickerProps) {
  const selected = new Set(selectedIds)
  const rootClass = compact ? 'fc-skill-picker' : 'pf-skill-picker'
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <div className={rootClass}>
      <div className={`${rootClass}-toolbar`}>
        {onSelectAll ? (
          <button type="button" className={`${rootClass}-link`} onClick={onSelectAll}>
            全选
          </button>
        ) : null}
        {onSelectNone ? (
          <button type="button" className={`${rootClass}-link`} onClick={onSelectNone}>
            不使用
          </button>
        ) : null}
        {onUpload ? (
          <button
            type="button"
            className={`${rootClass}-link`}
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? '上传中…' : '上传 .md'}
          </button>
        ) : null}
      </div>
      {skills.length === 0 ? (
        <p className={`${rootClass}-empty`}>{emptyText}</p>
      ) : (
        <ul className={`${rootClass}-list`}>
          {skills.map((skill) => {
            const checked = selected.has(skill.id)
            return (
              <li key={skill.id}>
                <label className={`${rootClass}-item${checked ? ' is-checked' : ''}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(skill.id)}
                  />
                  <span>
                    <strong>{skill.name}</strong>
                    {skill.description ? <em>{skill.description}</em> : null}
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      )}
      {onUpload ? (
        <>
          <input
            ref={fileRef}
            type="file"
            accept=".md,.markdown,.txt"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) onUpload(file)
            }}
          />
          <p className={`${rootClass}-hint`}>
            上传 Cursor 风格 SKILL.md：YAML 头写 name / description / tasks，下面写正文。
          </p>
        </>
      ) : null}
      {uploadError ? <p className={`${rootClass}-error`}>{uploadError}</p> : null}
    </div>
  )
}
