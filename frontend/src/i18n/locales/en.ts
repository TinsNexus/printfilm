import { enErrors } from './en/errors'
import { enPages } from './en/pages'
import { enShell } from './en/shell'

export const en = {
  ...enShell,
  ...enErrors,
  ...enPages,
}
