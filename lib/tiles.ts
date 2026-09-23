// Чтение и запись раскладки плиток. Чистая часть (разбор, склейка с тем, что отдала
// страница) вынесена в tiles-core.ts: этот файл тянет базу, а значит server-only, и из
// клиентской сетки плиток его импортировать нельзя.

import { cookies } from 'next/headers'
import { cache } from 'react'
import { sql } from './db.ts'
import { gridLabels } from './grid-labels.ts'
import type { Locale } from './i18n.ts'
import { getCurrentUser } from './session.ts'
import { getSetting, setSetting } from './settings.ts'
import {
  applyLayout,
  parseLayout,
  serializeLayout,
  tileKey,
  TILES_ENABLED_KEY,
  TILES_FOR_COOKIE,
  userTileKey,
  type TilePage,
  type TilePlacement,
} from './tiles-core.ts'

export async function readLayout(page: TilePage): Promise<TilePlacement[]> {
  return parseLayout(await getSetting(tileKey(page)))
}

/** userId — личная раскладка этого диспетчера, иначе общая. Пустой список в личной
 *  раскладке значит «как у всех»: tileGrid тогда берёт общую. */
export async function writeLayout(page: TilePage, layout: TilePlacement[], userId?: number): Promise<void> {
  await setSetting(userId != null ? userTileKey(page, userId) : tileKey(page), serializeLayout(layout))
}

/** Разрешена ли перестановка вообще. Нет ключа — нет и перестановки: по умолчанию она
 *  заблокирована, включают её в настройках (см. TILES_ENABLED_KEY). */
export async function tilesEnabled(): Promise<boolean> {
  return (await getSetting(TILES_ENABLED_KEY)) === '1'
}

export type TilePerson = { id: number; name: string }

/** Диспетчеры, которым администратор может поставить личную раскладку. Только
 *  действующие и настоящие: демо, отключённые и ждущие подтверждения — не в счёт.
 *  cache — чтобы два сетки на одной странице («Документы») не спрашивали базу дважды. */
export const tilePeople = cache(async (): Promise<TilePerson[]> => {
  const rows = (await sql`
    SELECT id, name FROM users
    WHERE role = 'dispatcher' AND is_demo = FALSE AND disabled_at IS NULL AND pending_since IS NULL
    ORDER BY name`) as { id: number; name: string }[]
  return rows.map((r) => ({ id: Number(r.id), name: r.name }))
})

/** Всё, что сетке нужно от сервера, одним вызовом: сохранённый порядок, склеенный с
 *  тем, что задала страница, готовые подписи и разрешена ли перестановка.
 *
 *  Собрано вместе не ради краткости: разделов и карточек десять, и про выключатель на
 *  любом из них легко забыть — тогда на одной странице кнопка «Переставить» осталась
 *  бы видна, хотя в настройках перестановка выключена. */
export async function tileGrid(
  page: TilePage,
  defaults: TilePlacement[],
  locale: Locale,
  /** Правка сохранённого порядка перед склейкой: когда одну плитку разобрали на
   *  несколько, старый ключ надо заменить новыми НА ЕГО МЕСТЕ, иначе applyLayout
   *  выбросит его как незнакомый, а новые припишет в самый конец страницы. */
  migrate?: (saved: TilePlacement[]) => TilePlacement[],
): Promise<{
  page: TilePage
  layout: TilePlacement[]
  defaults: TilePlacement[]
  labels: ReturnType<typeof gridLabels>
  admin: boolean
  enabled: boolean
  /** Кому администратор может поставить личную раскладку (у остальных — пусто). */
  people: TilePerson[]
  /** Чью раскладку администратор сейчас видит и правит; null — общую. */
  forUser: TilePerson | null
}> {
  const user = await getCurrentUser()
  // Переставляет только администратор (решение владельца 23.09.2026): порядок общий
  // на всю компанию, и диспетчер не должен сдвигать его остальным.
  const admin = user?.role === 'admin'
  let people: TilePerson[] = []
  let forUser: TilePerson | null = null
  if (admin && !user.isDemo) {
    people = await tilePeople()
    const id = Number((await cookies()).get(TILES_FOR_COOKIE)?.value)
    forUser = people.find((p) => p.id === id) ?? null
  }
  // Чья раскладка: у администратора — выбранного диспетчера, у диспетчера — своя.
  // Личной нет — общая.
  const target = admin ? (forUser?.id ?? null) : user && !user.isDemo ? user.id : null
  const [shared, own, enabled] = await Promise.all([
    readLayout(page),
    target != null ? getSetting(userTileKey(page, target)).then(parseLayout) : Promise.resolve([]),
    tilesEnabled(),
  ])
  const saved = own.length ? own : shared
  const start = migrate ? migrate(saved) : saved
  return {
    page,
    layout: applyLayout(start, defaults),
    defaults,
    labels: gridLabels(locale),
    admin,
    enabled: admin && enabled,
    people,
    forUser,
  }
}
