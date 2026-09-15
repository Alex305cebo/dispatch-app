import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h, Suspense as ReactSuspense, type ReactNode } from 'react'
import { renderToReadableStream } from 'react-dom/server.edge'
import { Suspense } from '../components/suspense.ts'

// Карточка трака, как на обзоре: граница строки доставки внутри страницы, которая сама
// досылается потоком (app/loading.tsx). Fallback и содержимое приходят позже разметки
// вокруг — так бывает, когда RSC-сервер вынес их в отдельные строки потока. Каждой метке
// <!--$?--><template id="B:n"> обязан прийти свой $RC("B:n"), иначе в браузере React #419.
// Почему это не само собой — components/suspense.ts.

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Узел, который первые `ms` ещё «в пути»: бросает промис, как не пришедшая строка RSC. */
function arrives(ms: number, value: ReactNode): ReactNode {
  const s = { ready: false, promise: wait(ms).then(() => void (s.ready = true)) }
  return {
    $$typeof: Symbol.for('react.lazy'),
    _payload: s,
    _init: () => {
      if (s.ready) return value
      throw s.promise
    },
  } as unknown as ReactNode
}

/** Метки границ, которым так и не пришёл $RC. */
async function unfinished(boundary: (fallback: ReactNode, children: ReactNode) => ReactNode): Promise<string[]> {
  const card = h(
    'a',
    { href: '/trucks/1' },
    h('div', null, 'TRK-101'),
    boundary(arrives(150, h('div', null, 'To delivery · Dallas, TX')), arrives(300, '962 mi')),
  )
  const page = h('html', null, h('body', null, h(ReactSuspense, { fallback: 'Loading…' }, arrives(10, h('main', null, card)))))
  const html = await new Response(await renderToReadableStream(page)).text()
  const done = new Set([...html.matchAll(/\$RC\("(B:[0-9a-f]+)"/g)].map((m) => m[1]))
  return [...html.matchAll(/<!--\$\?--><template id="(B:[0-9a-f]+)">/g)].map((m) => m[1]!).filter((id) => !done.has(id))
}

test('голый Suspense из React теряет такую границу — ради этого и есть components/suspense.ts', async () => {
  // Упадёт, когда React это починит: тогда обёртку можно убрать.
  assert.notDeepEqual(await unfinished((fallback, children) => h(ReactSuspense, { fallback }, children)), [])
})

test('наш Suspense досылает каждую границу', async () => {
  assert.deepEqual(await unfinished((fallback, children) => h(Suspense, { fallback }, children)), [])
})
