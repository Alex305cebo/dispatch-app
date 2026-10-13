import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groupByKind, norm, quickMatch, type QuickItem } from './quick-search.ts'

const items: QuickItem[] = [
  { kind: 'page', href: '/money', title: 'Деньги' },
  { kind: 'load', href: '/loads/1', title: 'Chicago, IL → Dallas, TX', sub: '#CHI-4471 · В пути', extra: 'Summit Logistics 123456 DEMO-204 Sam Rivera', rank: 3 },
  { kind: 'load', href: '/loads/2', title: 'Dallas, TX → Denver, CO', sub: '#DAL-9000 · Доставлен', extra: 'Prairie Route 654321 DEMO-101 Alex Morgan', rank: 2 },
  { kind: 'load', href: '/loads/3', title: 'Chicago, IL → Memphis, TN', sub: '#CHI-7039 · Оплачен', extra: 'Summit Logistics', rank: 1 },
  { kind: 'truck', href: '/trucks/7', title: 'DEMO-204', sub: 'Sam Rivera', extra: 'TRL-TR-204' },
  { kind: 'broker', href: '/brokers?q=Summit', title: 'Summit Logistics', sub: 'MC 123456' },
]
const hrefs = (l: QuickItem[]) => l.map((i) => i.href)

test('norm: регистр, знаки и ударения не мешают', () => {
  assert.equal(norm('  Chicago,  IL → '), 'chicago il')
  assert.equal(norm('José #CHI-4471'), 'jose chi 4471')
  assert.equal(norm(null), '')
})

test('все слова запроса — в любом порядке', () => {
  assert.deepEqual(hrefs(quickMatch(items, 'dallas chicago')), ['/loads/1'])
  assert.deepEqual(hrefs(quickMatch(items, 'чикаго')), [])
})

test('номер груза, MC брокера, водитель трака', () => {
  assert.deepEqual(hrefs(quickMatch(items, 'chi-4471')), ['/loads/1'])
  // MC в подписи брокера весит больше, чем тот же MC в скрытых номерах груза.
  assert.deepEqual(hrefs(quickMatch(items, '123456')), ['/brokers?q=Summit', '/loads/1'])
  // Водитель — в подписи трака и в скрытом у груза: трак выше.
  assert.deepEqual(hrefs(quickMatch(items, 'rivera')), ['/trucks/7', '/loads/1'])
})

test('начало названия выше, чем середина; при равенстве — свежий груз выше', () => {
  // «demo» начинает название трака и сидит внутри грузов.
  assert.equal(quickMatch(items, 'demo-204')[0]!.href, '/trucks/7')
  assert.deepEqual(hrefs(quickMatch(items, 'chicago')), ['/loads/1', '/loads/3'])
  assert.deepEqual(hrefs(quickMatch(items, 'день')), ['/money'])
})

test('из рода — не больше perKind, пустой запрос — пусто', () => {
  assert.equal(quickMatch(items, 'summit', 1).filter((i) => i.kind === 'load').length, 1)
  assert.deepEqual(quickMatch(items, '   '), [])
})

test('группы — в порядке лучшего совпадения', () => {
  const groups = groupByKind(quickMatch(items, 'demo-204'))
  assert.deepEqual(
    groups.map((g) => g.kind),
    ['truck', 'load'],
  )
})
