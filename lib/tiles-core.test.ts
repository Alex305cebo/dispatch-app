import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { applyLayout, parseLayout, serializeLayout, tileKey } from './tiles-core.ts'

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
