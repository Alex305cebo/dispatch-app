// Воркер maplibre-gl 6 — отдельный файл, который библиотека ищет рядом со своим
// модулем. В сборке Next «рядом» ничего нет, поэтому воркер и его общий кусок
// (maplibre-gl-shared, воркер импортирует его относительным путём — нужны оба)
// лежат в public/maplibre, а fleet-map.tsx указывает на них через setWorkerUrl.
//
// Расширение .js, а не родное .mjs: модульный воркер браузер запускает только с
// JS-типом ответа, а хостинг отдавал .mjs чужим типом — воркер молча не стартовал,
// и вместо карты был пустой фон (25.09.2026). Поэтому импорт внутри воркера
// переписан на .js.
//
// Файлы закоммичены: Hostinger может собирать не через `npm run build`, и тогда
// prebuild не сработает. Этот скрипт (prebuild/predev) просто держит их в ногу с
// установленной версией, а lib/maplibre-worker.test.ts ловит расхождение в CI.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const dist = path.join(path.dirname(createRequire(import.meta.url).resolve('maplibre-gl/package.json')), 'dist')
const dest = path.join(process.cwd(), 'public', 'maplibre')

/** Содержимое файла для public/maplibre: импорт общего куска — с .js. */
export function shipped(file) {
  return readFileSync(path.join(dist, `${file}.mjs`), 'utf8').replaceAll('"./maplibre-gl-shared.mjs"', '"./maplibre-gl-shared.js"')
}

if (process.argv[1] === import.meta.filename) {
  mkdirSync(dest, { recursive: true })
  for (const file of ['maplibre-gl-worker', 'maplibre-gl-shared']) {
    writeFileSync(path.join(dest, `${file}.js`), shipped(file))
  }
}
