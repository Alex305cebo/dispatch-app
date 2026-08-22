// Шаги вводной экскурсии: что первому администратору сделать после установки.
//
// Зачем сервер. Шаг «уже сделано» решается не памятью браузера, а состоянием базы:
// ключи вставлены, реквизиты заполнены, трак заведён. Иначе экскурсия врёт — гонит
// по кругу за тем, что человек сделал вчера с другого устройства.

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
  done: boolean
}

export async function tourSteps(user: CurrentUser | null, locale: Locale): Promise<TourStep[] | null> {
  // Только настоящему администратору: шаги — про ключи, людей и реквизиты, и
  // диспетчеру там делать нечего. Демо-аккаунт тоже мимо: он ничего не настраивает.
  if (!user || user.role !== 'admin' || user.isDemo) return null

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

  const steps: TourStep[] = [
    { key: 'welcome', href: '', target: 'avatar', done: false },
    { key: 'keys', href: '/admin', target: 'keys', done: gemini !== '' },
    { key: 'company', href: '/admin', target: 'company', done: !!conf.get('co_mcdot') },
    { key: 'users', href: '/admin', target: 'users', done: n.users > 1 },
    { key: 'trucks', href: '/trucks/new', target: 'nav-trucks', done: n.trucks > 0 },
    { key: 'loads', href: '/loads/new', target: 'nav-loads', done: n.loads > 0 },
  ].map((s) => ({
    ...s,
    title: t(locale, `tour.${s.key}.title` as Parameters<typeof t>[1]),
    text: t(locale, `tour.${s.key}.text` as Parameters<typeof t>[1]),
  }))

  // Всё уже настроено — экскурсии нет. Иначе она всплыла бы у компании, которая
  // работает третий месяц, просто потому что зашли с нового устройства.
  // 'welcome' не в счёт: у него нет состояния, он просто здоровается.
  if (steps.every((s) => s.key === 'welcome' || s.done)) return null

  return steps
}
