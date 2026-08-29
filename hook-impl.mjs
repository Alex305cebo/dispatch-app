import fs from 'node:fs'
export async function resolve(spec, ctx, next) {
  if (spec === 'server-only') return { url: 'data:text/javascript,export{}', shortCircuit: true }
  let s = spec
  if (s.startsWith('@/')) s = new URL(s.slice(2), 'file:///D:/Dispatch%20App/').href
  if ((s.startsWith('./') || s.startsWith('../') || s.startsWith('file:')) && !/\.(ts|tsx|js|mjs|json)$/.test(s)) {
    const url = s.startsWith('file:') ? s : new URL(s, ctx.parentURL).href
    for (const ext of ['.ts', '.tsx']) {
      if (fs.existsSync(new URL(url + ext))) return next(url + ext, ctx)
    }
  }
  return next(s, ctx)
}
