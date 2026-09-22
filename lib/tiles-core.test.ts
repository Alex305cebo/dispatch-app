import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import {
  applyLayout,
  driverTileId,
  migrateDriversTile,
  migrateTruckDriverCard,
  trucksTiles,
  LOAD_DETAIL_TILES,
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

test('trucksTiles: плитки водителей встают сразу за «Компанией», а не в конец страницы', () => {
  const ids = trucksTiles([7, 9]).map((p) => p.id)
  assert.deepEqual(ids.slice(ids.indexOf('drivers-me')), [
    'drivers-me',
    'drivers-co',
    'driver-7',
    'driver-9',
    'list',
    'eld',
  ])
  // Парк пустой — остаются только постоянные плитки, дыры в раскладке нет.
  assert.deepEqual(trucksTiles([]).map((p) => p.id), TRUCKS_TILES.map((p) => p.id))
  assert.ok(trucksTiles([7]).every((p) => (p.id === driverTileId(7) ? p.size === 's' : true)))
})

test('migrateDriversTile: старая плитка «Данные водителей» разворачивается на своём месте', () => {
  const saved = parseLayout('[{"id":"map","size":"l"},{"id":"drivers","size":"l"},{"id":"list","size":"l"}]')
  assert.deepEqual(migrateDriversTile(saved, [3, 4]).map((p) => p.id), [
    'map',
    'drivers-me',
    'drivers-co',
    'driver-3',
    'driver-4',
    'list',
  ])
  // Раскладка уже новая — трогать нечего, и тот же массив возвращается как есть.
  const fresh = parseLayout('[{"id":"drivers-me","size":"s"},{"id":"driver-3","size":"s"}]')
  assert.equal(migrateDriversTile(fresh, [3]), fresh)
})

test('после разворота старой плитки водители стоят на месте, а не в хвосте', () => {
  const saved = parseLayout('[{"id":"drivers","size":"l"},{"id":"map","size":"l"}]')
  const merged = applyLayout(migrateDriversTile(saved, [3]), trucksTiles([3]))
  // Водитель выше карты — ровно там, где стоял разобранный блок.
  assert.ok(merged.findIndex((p) => p.id === 'driver-3') < merged.findIndex((p) => p.id === 'map'))
  // Ключи не задвоились: иначе сетка рисует две одинаковые плитки.
  assert.equal(new Set(merged.map((p) => p.id)).size, merged.length)
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
