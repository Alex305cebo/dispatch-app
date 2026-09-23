import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Воркер карты в public/maplibre должен быть той же версии, что maplibre-gl в
// node_modules: у основного модуля и воркера общий протокол сообщений, и чужой
// воркер даёт пустую подложку без единой ошибки на странице. После обновления
// maplibre-gl — `node scripts/copy-maplibre-worker.mjs` и закоммитить public/maplibre.
for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  test(`public/maplibre/${file} совпадает с установленным maplibre-gl`, () => {
    const shipped = readFileSync(`public/maplibre/${file}`)
    const installed = readFileSync(`node_modules/maplibre-gl/dist/${file}`)
    assert.ok(shipped.equals(installed), `устарел public/maplibre/${file}: запустите node scripts/copy-maplibre-worker.mjs`)
  })
}
