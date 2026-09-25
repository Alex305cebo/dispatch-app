import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { shipped } from '../scripts/copy-maplibre-worker.mjs'

// Воркер карты в public/maplibre должен быть той же версии, что maplibre-gl в
// node_modules: у основного модуля и воркера общий протокол сообщений, и чужой
// воркер даёт пустую подложку без единой ошибки на странице. После обновления
// maplibre-gl — `node scripts/copy-maplibre-worker.mjs` и закоммитить public/maplibre.
for (const file of ['maplibre-gl-worker', 'maplibre-gl-shared']) {
  test(`public/maplibre/${file}.js совпадает с установленным maplibre-gl`, () => {
    assert.equal(readFileSync(`public/maplibre/${file}.js`, 'utf8'), shipped(file), `устарел public/maplibre/${file}.js: запустите node scripts/copy-maplibre-worker.mjs`)
  })
}

// Воркер грузит общий кусок относительным путём — и тоже как .js, иначе хостинг
// отдаст его тем же чужим типом, что и .mjs.
test('воркер импортирует общий кусок как .js', () => {
  const worker = readFileSync('public/maplibre/maplibre-gl-worker.js', 'utf8')
  assert.ok(worker.includes('"./maplibre-gl-shared.js"'))
  assert.ok(!worker.includes('.mjs"'))
})
