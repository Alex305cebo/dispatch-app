import fs from 'node:fs'
for (const line of fs.readFileSync('.env.local','utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
  if (m) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g,'')
}
const { saferSearch, saferSnapshot } = await import('./lib/safer.ts')
const { chooseCompany, compact, searchTerms } = await import('./lib/broker-match.ts')
const name = 'Nolan Transportation Group'
console.log('terms:', searchTerms(name))
const hits: { dot: string; legalName: string }[] = []
for (const term of searchTerms(name)) {
  const r = await saferSearch(term)
  console.log('search', JSON.stringify(term), '->', r.length)
  for (const h of r) if (!hits.some((x) => x.dot === h.dot)) hits.push(h)
  if (hits.some((h) => compact(h.legalName) === compact(name))) break
}
const want = compact(name)
console.log('want:', want)
for (const h of hits.slice(0, 12)) console.log(' hit', h.dot, h.legalName, '| compact:', compact(h.legalName))
const worth = hits.filter((h) => compact(h.legalName).startsWith(want)).slice(0, 4)
console.log('worth:', worth)
const cards = []
for (const h of worth) {
  const snap = await saferSnapshot(h.dot)
  if (!snap) { console.log('no snap for', h.dot); continue }
  cards.push({ dot: h.dot, legalName: snap.legalName ?? h.legalName, dbaName: snap.dbaName, phone: snap.phone, entityType: snap.entityType, operatingStatus: snap.operatingStatus, mc: snap.mc })
}
console.log('cards:', cards)
console.log('best:', chooseCompany(name, null, cards as any))
