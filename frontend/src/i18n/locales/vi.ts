import { viErrors } from './vi/errors'
import { viPages } from './vi/pages'
import { viShell } from './vi/shell'

export const vi = {
  ...viShell,
  ...viErrors,
  ...viPages,
}
