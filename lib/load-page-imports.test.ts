import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Карточка груза не должна грузить GramJS: он тянет пакет websocket, и когда тот не
// поднимается на сервере, падает вся страница — чёрный 500 на любом грузе (10/22/26).
// «Подключён ли Telegram» — из lib/telegram-status.ts, там только settings.
test('карточка груза не импортирует lib/telegram (GramJS)', () => {
  const src = readFileSync(new URL('../app/loads/[id]/page.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /from '@\/lib\/telegram'/)
  const status = readFileSync(new URL('./telegram-status.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(status, /from 'telegram/)
})
