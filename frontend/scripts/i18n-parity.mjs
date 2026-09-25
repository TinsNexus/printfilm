// 三语言（zh / en / vi）文案键与占位符一致性检查：用法 node scripts/i18n-parity.mjs
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'

const root = resolve(import.meta.dirname, '..')
const out = mkdtempSync(join(tmpdir(), 'i18n-parity-'))
try {
  execFileSync(
    'npx',
    ['tsc', '--outDir', out, '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck', '--ignoreConfig',
      '--rootDir', join(root, 'src'),
      'src/i18n/locales/zh.ts', 'src/i18n/locales/en.ts', 'src/i18n/locales/vi.ts'],
    { cwd: root, stdio: 'pipe' },
  )
  const req = createRequire(join(out, 'x.js'))
  const packs = {
    zh: req(join(out, 'i18n/locales/zh.js')).zh,
    en: req(join(out, 'i18n/locales/en.js')).en,
    vi: req(join(out, 'i18n/locales/vi.js')).vi,
  }
  // 展平为 path -> string；数组元素用 [i]
  const flat = (o, p = '', acc = {}) => {
    if (typeof o === 'string') acc[p] = o
    else if (o && typeof o === 'object')
      for (const [k, v] of Object.entries(o)) flat(v, Array.isArray(o) ? `${p}[${k}]` : p ? `${p}.${k}` : k, acc)
    return acc
  }
  const F = Object.fromEntries(Object.entries(packs).map(([k, v]) => [k, flat(v)]))
  const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')
  let bad = 0
  for (const a of ['zh', 'en', 'vi']) {
    for (const b of ['zh', 'en', 'vi']) {
      if (a === b) continue
      const miss = Object.keys(F[a]).filter((k) => !(k in F[b]))
      if (miss.length) { bad += miss.length; console.log(`in ${a} but missing in ${b} (${miss.length}):`, miss.slice(0, 15)) }
    }
    for (const [k, v] of Object.entries(F[a])) {
      if (k in F.zh && vars(v) !== vars(F.zh[k])) { bad++; console.log(`placeholder mismatch ${a}:${k}`, vars(v), 'vs zh', vars(F.zh[k])) }
    }
  }

  // 源码里字面量写法的 t('a.b') / tr('a.b') / t("a.b") 必须存在于 zh
  const walk = (d) => readdirSync(d).flatMap((n) => {
    const f = join(d, n)
    return statSync(f).isDirectory() ? walk(f) : /\.tsx?$/.test(n) ? [f] : []
  })
  const known = new Set(Object.keys(F.zh).map((k) => k.replace(/\[\d+\]/g, '')))
  const prefixOf = (path) => [...known].some((k) => k === path || k.startsWith(path + '.'))
  for (const f of walk(join(root, 'src')).filter((f) => !f.includes('/i18n/locales/'))) {
    const src = readFileSync(f, 'utf8')
    for (const m of src.matchAll(/(?<![\w.])(?:t|tr)\(\s*(['"])([A-Za-z][\w]*(?:\.[\w\u4e00-\u9fff]+)+)\1/g)) {
      if (!prefixOf(m[2])) { bad++; console.log(`unknown key ${m[2]}  (${f.replace(root + '/', '')})`) }
    }
  }
  console.log(`keys zh=${Object.keys(F.zh).length} en=${Object.keys(F.en).length} vi=${Object.keys(F.vi).length}`)
  console.log(bad ? `FAIL (${bad} issues)` : 'PARITY_OK')
  process.exitCode = bad ? 1 : 0
} finally {
  rmSync(out, { recursive: true, force: true })
}
