// Чтение и запись раскладки плиток. Чистая часть (разбор, склейка с тем, что отдала
// страница) вынесена в tiles-core.ts: этот файл тянет базу, а значит server-only, и из
// клиентской сетки плиток его импортировать нельзя.

import { getSetting, setSetting } from './settings.ts'
import { parseLayout, serializeLayout, tileKey, type TilePage, type TilePlacement } from './tiles-core.ts'

export async function readLayout(page: TilePage): Promise<TilePlacement[]> {
  return parseLayout(await getSetting(tileKey(page)))
}

export async function writeLayout(page: TilePage, layout: TilePlacement[]): Promise<void> {
  await setSetting(tileKey(page), serializeLayout(layout))
}
