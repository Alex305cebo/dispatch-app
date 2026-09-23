// Воркер maplibre-gl 6 — отдельный файл, который библиотека ищет рядом со своим
// модулем. В сборке Next «рядом» ничего нет, поэтому воркер и его общий кусок
// (maplibre-gl-shared.mjs, воркер импортирует его относительным путём — нужны оба)
// лежат в public/maplibre, а fleet-map.tsx указывает на них через setWorkerUrl.
//
// Файлы закоммичены: Hostinger может собирать не через `npm run build`, и тогда
// prebuild не сработает. Этот скрипт (prebuild/predev) просто держит их в ногу с
// установленной версией, а lib/maplibre-worker.test.ts ловит расхождение в CI.
import { copyFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const dist = path.join(path.dirname(createRequire(import.meta.url).resolve('maplibre-gl/package.json')), 'dist')
const dest = path.join(process.cwd(), 'public', 'maplibre')

mkdirSync(dest, { recursive: true })
for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  copyFileSync(path.join(dist, file), path.join(dest, file))
}
