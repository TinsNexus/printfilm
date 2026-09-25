import { zhErrors } from './zh/errors'
import { zhPages } from './zh/pages'
import { zhShell } from './zh/shell'

export const zh = {
  ...zhShell,
  ...zhErrors,
  ...zhPages,
}
