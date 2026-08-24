// Шаги вводной экскурсии: как работает приложение и что сделать после установки.
//
// Два зрителя. Администратор при первом входе — ему шаги про ключи, людей и
// реквизиты помечаются «уже сделано» по состоянию базы, а не по памяти браузера:
// иначе экскурсия гонит по кругу за тем, что человек сделал вчера с другого
// устройства. И гость демо — ему те же экраны, но ничего не «сделано» и ничего
// не запоминается: каждый новый посетитель должен увидеть рассказ с начала.
//
// У каждого шага — снимок настоящего экрана (public/guide, снимаются скриптом
// scripts/guide-shots.mjs с демо-данных). Подсветить кнопку мало: человек должен
// увидеть, как выглядит результат, до того как сам туда нажмёт.

import 'server-only'
import { sql } from './db.ts'
import { getSettings } from './settings.ts'
import { geminiKey } from './keys.ts'
import { t, type Locale } from './i18n.ts'
import type { CurrentUser } from './session.ts'

export type TourStep = {
  key: string
  title: string
  text: string
  /** Куда ведёт шаг. Пусто — шаг про то, что видно на любой странице. */
  href: string
  /** data-tour цели на странице. Пусто — карточка показывается по центру. */
  target: string
  /** Снимок экрана из public/guide. Пусто — шаг без картинки. */
  image: string
  done: boolean
}

type Def = { key: string; href: string; target: string; image: string; admin?: boolean }

/** Порядок — это и есть первый рабочий день: настроить, завести трак, взять груз,
 * следить, собрать бумаги, выставить счёт. */
const STEPS: Def[] = [
  { key: 'welcome', href: '/', target: '', image: 'overview' },
  { key: 'keys', href: '/admin', target: 'keys', image: 'admin-keys', admin: true },
  { key: 'company', href: '/admin', target: 'company', image: 'admin-company', admin: true },
  { key: 'users', href: '/admin', target: 'users', image: 'admin-users', admin: true },
  { key: 'trucks', href: '/trucks/new', target: 'nav-trucks', image: 'truck-new' },
  { key: 'truckCard', href: '/trucks', target: '', image: 'truck-detail' },
  { key: 'loads', href: '/loads/new', target: 'nav-loads', image: 'load-new' },
  { key: 'loadCard', href: '/loads', target: '', image: 'load-detail' },
  // Раздел слился с «Траками» — шаг остаётся (карта и живой список никуда не
  // делись), но ведёт туда же, куда теперь ведёт меню.
  { key: 'tracking', href: '/trucks', target: 'nav-trucks', image: 'tracking' },
  { key: 'docs', href: '/docs', target: 'nav-docs', image: 'docs' },
  { key: 'brokers', href: '/brokers', target: '', image: 'brokers' },
  { key: 'tolls', href: '/tolls', target: '', image: 'tolls' },
  { key: 'invoices', href: '/invoices', target: '', image: 'invoices' },
]

export async function tourSteps(user: CurrentUser | null, locale: Locale): Promise<TourStep[] | null> {
  if (!user) return null
  // Диспетчеру — нет: настраивать ему нечего, а экраны он и так знает от того,
  // кто его завёл. Админу и гостю демо — да.
  if (user.role !== 'admin' && !user.isDemo) return null

  const label = (s: Def, done: boolean): TourStep => ({
    key: s.key,
    href: s.href,
    target: s.target,
    image: s.image,
    done,
    title: t(locale, `tour.${s.key}.title` as Parameters<typeof t>[1]),
    text: t(locale, `tour.${s.key}.text` as Parameters<typeof t>[1]),
  })

  // Демо: админских шагов нет (в админку гостя не пускает), ничего не «сделано».
  if (user.isDemo) return STEPS.filter((s) => !s.admin).map((s) => label(s, false))

  const conf = await getSettings(['co_mcdot', `tour_done:${user.id}`])
  if (conf.get(`tour_done:${user.id}`) === '1') return null

  const [gemini, counts] = await Promise.all([
    geminiKey(),
    // Один запрос вместо трёх: у HTTP-драйвера Neon каждый вызов — отдельный
    // сетевой поход, а это чтение висит на каждой странице.
    //
    // trucks.id <> 1 — посеянная заглушка «Трак не настроен» лежит в схеме под
    // первым номером и есть в любой установке; настоящий трак получает следующий.
    sql`SELECT
          (SELECT count(*)::int FROM users  WHERE is_demo = FALSE)                     AS users,
          (SELECT count(*)::int FROM trucks WHERE company_id = 'default' AND id <> 1)  AS trucks,
          (SELECT count(*)::int FROM loads  WHERE company_id = 'default')              AS loads`,
  ])
  const n = (counts as { users: number; trucks: number; loads: number }[])[0] ?? {
    users: 1,
    trucks: 0,
    loads: 0,
  }
  const doneByKey: Record<string, boolean> = {
    keys: gemini !== '',
    company: !!conf.get('co_mcdot'),
    users: n.users > 1,
    trucks: n.trucks > 0,
    loads: n.loads > 0,
  }
  return STEPS.map((s) => label(s, doneByKey[s.key] ?? false))
}
