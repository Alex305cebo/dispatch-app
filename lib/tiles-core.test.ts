import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import {
  applyLayout,
  migrateTruckDriverCard,
  migrateTrucksTiles,
  migrateLoadCard,
  migrateLoadOrder,
  migrateLoadPapers,
  migrateLoadsMap,
  LOAD_DETAIL_TILES,
  LOADS_TILES,
  parseLayout,
  serializeLayout,
  TILE_PAGES,
  TILE_PATHS,
  tileKey,
  TRUCK_DETAIL_TILES,
  TRUCKS_TILES,
} from './tiles-core.ts'

test('tileKey — устойчивое имя ключа в settings', () => {
  assert.equal(tileKey('overview'), 'tiles:overview')
  assert.equal(tileKey('invoices'), 'tiles:invoices')
})

test('parseLayout переживает мусор в базе, а не роняет раздел', () => {
  assert.deepEqual(parseLayout(null), [])
  assert.deepEqual(parseLayout(''), [])
  assert.deepEqual(parseLayout('не json'), [])
  assert.deepEqual(parseLayout('{"id":"a"}'), []) // объект, а не массив
  assert.deepEqual(parseLayout('[null, 5, "x"]'), [])
})

test('parseLayout: неизвестный размер превращается в маленькую, а не выбрасывает плитку', () => {
  assert.deepEqual(parseLayout('[{"id":"gross","size":"huge"}]'), [{ id: 'gross', size: 's' }])
  assert.deepEqual(parseLayout('[{"id":"gross"}]'), [{ id: 'gross', size: 's' }])
})

test('parseLayout сохраняет размер «Мини» (xs), а не сбрасывает его в маленькую', () => {
  assert.deepEqual(parseLayout('[{"id":"gross","size":"xs"}]'), [{ id: 'gross', size: 'xs' }])
})

test('parseLayout выкидывает повтор ключа: иначе плитка встала бы в сетку дважды', () => {
  assert.deepEqual(parseLayout('[{"id":"a","size":"w"},{"id":"a","size":"l"}]'), [
    { id: 'a', size: 'w' },
  ])
})

test('applyLayout держит сохранённый порядок и размеры', () => {
  const saved = [
    { id: 'b', size: 'l' as const },
    { id: 'a', size: 'w' as const },
  ]
  const defaults = [
    { id: 'a', size: 's' as const },
    { id: 'b', size: 's' as const },
  ]
  assert.deepEqual(applyLayout(saved, defaults), saved)
})

test('applyLayout: плитки, которой больше нет в коде, в сетке не будет', () => {
  const saved = [
    { id: 'ушла', size: 'l' as const },
    { id: 'a', size: 'w' as const },
  ]
  const defaults = [{ id: 'a', size: 's' as const }]
  assert.deepEqual(applyLayout(saved, defaults), [{ id: 'a', size: 'w' }])
})

test('applyLayout: новая плитка встаёт В КОНЕЦ и со своим размером', () => {
  const saved = [{ id: 'a', size: 'w' as const }]
  const defaults = [
    { id: 'a', size: 's' as const },
    { id: 'новая', size: 'l' as const },
  ]
  assert.deepEqual(applyLayout(saved, defaults), [
    { id: 'a', size: 'w' },
    { id: 'новая', size: 'l' },
  ])
})

test('applyLayout без сохранённого отдаёт ровно то, что задала страница', () => {
  const defaults = [
    { id: 'a', size: 's' as const },
    { id: 'b', size: 'l' as const },
  ]
  assert.deepEqual(applyLayout([], defaults), defaults)
})

test('serializeLayout → parseLayout — круг без потерь', () => {
  const layout = [
    { id: 'gross', size: 'w' as const },
    { id: 'heatmap', size: 'l' as const },
    { id: 'rpm', size: 's' as const },
  ]
  assert.deepEqual(parseLayout(serializeLayout(layout)), layout)
})

test('условная плитка не теряет своё место, пока её нет на экране', () => {
  // Карточка груза: у отменённого груза нет ни хронологии водителя, ни «мы здесь
  // уже были». Диспетчер переставил плитки на обычном грузе — открыл отменённый —
  // вернулся. Порядок должен остаться тем же, а не съехать на один вниз.
  const saved = [
    { id: 'map', size: 'l' as const },
    { id: 'driver', size: 'l' as const },
    { id: 'hero', size: 'l' as const },
  ]
  const merged = applyLayout(saved, LOAD_DETAIL_TILES)
  assert.deepEqual(
    merged.slice(0, 3),
    [
      { id: 'map', size: 'l' },
      { id: 'driver', size: 'l' },
      { id: 'hero', size: 'l' },
    ],
  )
  // Сетка рисует только то, что страница отдала, и «driver» среди этого нет —
  // но из раскладки он не выпал, поэтому на следующем грузе встанет на своё место.
  const onScreen = new Set(['map', 'hero'])
  assert.deepEqual(
    merged.filter((p) => onScreen.has(p.id)).map((p) => p.id),
    ['map', 'hero'],
  )
})

test('у каждой карточки все её плитки перечислены в раскладке по умолчанию', () => {
  for (const list of [LOAD_DETAIL_TILES, TRUCK_DETAIL_TILES]) {
    const ids = list.map((p) => p.id)
    assert.equal(new Set(ids).size, ids.length, 'ключи плиток не повторяются')
  }
})

test('у каждого раздела есть адрес — иначе сохранение не найдёт, что обновить', () => {
  for (const page of TILE_PAGES) assert.ok(TILE_PATHS[page], page)
})

test('migrateTrucksTiles: четыре новые цифры встают на место старых, а не под ELD', () => {
  // Раскладка до 10/09/26: восемь цифр, карта, чипы, «Загрузка парка», водители.
  const saved = parseLayout(
    '[{"id":"map","size":"l"},{"id":"week-gross","size":"s"},{"id":"counter-1","size":"s"},{"id":"picker","size":"w"},{"id":"heatmap","size":"l"},{"id":"driver-3","size":"s"},{"id":"list","size":"l"},{"id":"eld","size":"w"}]',
  )
  const merged = applyLayout(migrateTrucksTiles(saved), TRUCKS_TILES)
  assert.deepEqual(
    merged.map((p) => p.id),
    ['map', 'on-load', 'free', 'off', 'attention', 'list', 'eld'],
  )
  // Ключи не задвоились: иначе сетка рисует две одинаковые плитки.
  assert.equal(new Set(merged.map((p) => p.id)).size, merged.length)
})

test('migrateTrucksTiles: без старых цифр новые встают перед картой', () => {
  const saved = parseLayout('[{"id":"list","size":"l"},{"id":"map","size":"w"}]')
  assert.deepEqual(
    applyLayout(migrateTrucksTiles(saved), TRUCKS_TILES).map((p) => p.id),
    ['list', 'on-load', 'free', 'off', 'attention', 'map', 'eld'],
  )
})

test('migrateTrucksTiles: новую раскладку и пустую не трогает', () => {
  const fresh = parseLayout('[{"id":"map","size":"l"},{"id":"free","size":"s"}]')
  assert.equal(migrateTrucksTiles(fresh), fresh)
  assert.deepEqual(migrateTrucksTiles([]), [])
})

test('migrateTruckDriverCard: плитка-дубль «Водитель» уходит, шапка трака забирает строку', () => {
  const saved = parseLayout(
    '[{"id":"driver-card","size":"w"},{"id":"hero","size":"w"},{"id":"assignment","size":"l"}]',
  )
  const merged = applyLayout(migrateTruckDriverCard(saved), TRUCK_DETAIL_TILES)
  assert.deepEqual(merged.slice(0, 2), [
    { id: 'hero', size: 'l' },
    { id: 'assignment', size: 'l' },
  ])
  assert.ok(!merged.some((p) => p.id === 'driver-card'))
  // Раскладку уже сохранили без старой плитки — размер шапки больше не трогаем.
  const fresh = parseLayout('[{"id":"hero","size":"w"}]')
  assert.equal(migrateTruckDriverCard(fresh), fresh)
})

test('migrateLoadPapers: кнопки груза влиты в статус, статус остаётся на месте и во всю строку', () => {
  const saved = parseLayout(
    '[{"id":"hero","size":"w"},{"id":"papers","size":"w"},{"id":"status","size":"w"},{"id":"rate","size":"l"}]',
  )
  const merged = applyLayout(migrateLoadPapers(saved), LOAD_DETAIL_TILES)
  assert.deepEqual(merged.slice(0, 2), [
    { id: 'hero', size: 'w' },
    { id: 'status', size: 'l' },
  ])
  assert.ok(!merged.some((p) => p.id === 'papers'))
  const fresh = parseLayout('[{"id":"status","size":"w"}]')
  assert.equal(migrateLoadPapers(fresh), fresh)
  // «Важное от брокера» ушло в шапку: ключ выпадает, шапка на своём месте и размере.
  const notes = applyLayout(
    migrateLoadPapers(parseLayout('[{"id":"notes","size":"l"},{"id":"hero","size":"w"},{"id":"status","size":"w"}]')),
    LOAD_DETAIL_TILES,
  )
  assert.deepEqual(notes.slice(0, 2), [
    { id: 'hero', size: 'w' },
    { id: 'status', size: 'w' },
  ])
})

test('migrateLoadPapers: «Точки» и «Подробности» влиты в шапку, шапка во всю строку', () => {
  const merged = applyLayout(
    migrateLoadPapers(parseLayout('[{"id":"hero","size":"w"},{"id":"stops","size":"w"},{"id":"status","size":"l"},{"id":"details","size":"l"}]')),
    LOAD_DETAIL_TILES,
  )
  assert.deepEqual(merged.slice(0, 2), [
    { id: 'hero', size: 'l' },
    { id: 'status', size: 'l' },
  ])
  assert.ok(!merged.some((p) => p.id === 'stops' || p.id === 'details'))
})

test('migrateLoadCard: старая карточка груза уступает новой — Документы и Инвойс рядом под картой', () => {
  // Раскладка до 10/09/26: отдельные «Ставка», «Мили на глаз», «Медленный брокер»,
  // «Расходы трака», бумаги и счёт внизу во всю строку.
  const saved = parseLayout(
    '[{"id":"hero","size":"l"},{"id":"warnings","size":"w"},{"id":"status","size":"l"},{"id":"rate","size":"l"},{"id":"map","size":"l"},{"id":"driver","size":"l"},{"id":"queued","size":"l"},{"id":"miles-estimated","size":"l"},{"id":"slow-payer","size":"l"},{"id":"driver-info","size":"l"},{"id":"facility-hints","size":"l"},{"id":"backhaul","size":"l"},{"id":"docs","size":"l"},{"id":"invoice","size":"l"},{"id":"truck-costs","size":"l"}]',
  )
  const merged = applyLayout(migrateLoadCard(saved), LOAD_DETAIL_TILES)
  assert.deepEqual(merged, LOAD_DETAIL_TILES)
  assert.deepEqual(
    merged.slice(0, 6).map((p) => `${p.id}:${p.size}`),
    ['hero:l', 'warnings:l', 'status:l', 'map:l', 'docs:w', 'invoice:w'],
  )
  // Совсем старая раскладка (кнопки груза ещё отдельной плиткой) — туда же.
  const older = parseLayout('[{"id":"papers","size":"w"},{"id":"hero","size":"w"},{"id":"rate","size":"l"}]')
  assert.deepEqual(applyLayout(migrateLoadCard(older), LOAD_DETAIL_TILES), LOAD_DETAIL_TILES)
})

test('migrateLoadOrder: раскладку, сохранённую уже без старых плиток, не трогает', () => {
  // Диспетчер поднял карту наверх после переезда — это его выбор.
  const fresh = parseLayout('[{"id":"map","size":"l"},{"id":"hero","size":"l"},{"id":"docs","size":"l"}]')
  assert.equal(migrateLoadOrder(fresh), fresh)
  assert.equal(migrateLoadCard(fresh), fresh)
  assert.deepEqual(migrateLoadOrder([]), [])
})

test('карточка груза: в раскладке нет плиток, которые влиты в шапку', () => {
  const ids = new Set(LOAD_DETAIL_TILES.map((p) => p.id))
  for (const gone of ['rate', 'truck-costs', 'miles-estimated', 'slow-payer', 'papers', 'notes', 'stops', 'details'])
    assert.ok(!ids.has(gone), gone)
})

test('migrateLoadsMap: карта встаёт перед списком, а не под все грузы', () => {
  const ids = (l: { id: string }[]) => l.map((p) => p.id)
  // Сохранено, пока карта была видом внутри списка: ключа 'map' нет.
  const saved = parseLayout(
    '[{"id":"week-rpm","size":"s"},{"id":"week-gross","size":"s"},{"id":"utilization","size":"s"},{"id":"next-week","size":"s"},{"id":"list","size":"l"}]',
  )
  assert.deepEqual(ids(applyLayout(migrateLoadsMap(saved), LOADS_TILES)), ['week-rpm', 'week-gross', 'utilization', 'next-week', 'map', 'list'])
  // Раскладка старше хранит карту на прежнем месте — её не трогаем.
  const older = parseLayout('[{"id":"map","size":"w"},{"id":"week-gross","size":"s"},{"id":"list","size":"l"}]')
  assert.equal(migrateLoadsMap(older), older)
  assert.deepEqual(ids(applyLayout(older, LOADS_TILES)), ['map', 'week-gross', 'list', 'week-rpm', 'utilization', 'next-week'])
  // Ничего не сохранено — порядок по умолчанию, карта сразу под цифрами.
  assert.deepEqual(migrateLoadsMap([]), [])
  assert.deepEqual(ids(applyLayout([], LOADS_TILES)), ['week-gross', 'week-rpm', 'utilization', 'next-week', 'map', 'list'])
})
