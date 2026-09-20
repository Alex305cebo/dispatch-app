// Чтение и запись раскладки плиток. Чистая часть (разбор, склейка с тем, что отдала
// страница) вынесена в tiles-core.ts: этот файл тянет базу, а значит server-only, и из
// клиентской сетки плиток его импортировать нельзя.

import { gridLabels } from './grid-labels.ts'
import type { Locale } from './i18n.ts'
import { getSetting, setSetting } from './settings.ts'
import {
  applyLayout,
  parseLayout,
  serializeLayout,
  tileKey,
  TILES_ENABLED_KEY,
  type TilePage,
  type TilePlacement,
} from './tiles-core.ts'

export async function readLayout(page: TilePage): Promise<TilePlacement[]> {
  return parseLayout(await getSetting(tileKey(page)))
}

export async function writeLayout(page: TilePage, layout: TilePlacement[]): Promise<void> {
  await setSetting(tileKey(page), serializeLayout(layout))
}

/** Разрешена ли перестановка вообще. Нет ключа — нет и перестановки: по умолчанию она
 *  заблокирована, включают её в настройках (см. TILES_ENABLED_KEY). */
export async function tilesEnabled(): Promise<boolean> {
  return (await getSetting(TILES_ENABLED_KEY)) === '1'
}

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
): Promise<{
  page: TilePage
  layout: TilePlacement[]
  defaults: TilePlacement[]
  labels: ReturnType<typeof gridLabels>
  enabled: boolean
}> {
  const [saved, enabled] = await Promise.all([readLayout(page), tilesEnabled()])
  return { page, layout: applyLayout(saved, defaults), defaults, labels: gridLabels(locale), enabled }
}
