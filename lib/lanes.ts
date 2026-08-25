// Направления: что мы возим часто и что из этого приносит деньги.
//
// Вопрос, ради которого это считается: «куда возить выгодно, а куда мы возим по
// привычке». По списку грузов на него не ответить — там каждый рейс сам по себе, а
// направление видно только когда одинаковые рейсы сложены вместе.
//
// Считается по своим же грузам, без всяких бирж: у нас есть ставка, мили и полная
// себестоимость каждого рейса, а это и есть ответ. Биржевые индексы говорят, сколько
// платят В СРЕДНЕМ ПО РЫНКУ; здесь — сколько заплатили НАМ и что осталось после
// топлива, водителя и всего прочего.

import type { LoadRecord } from './map.ts'

export type Lane = {
  /** «Silverpeak, NV → Orangeburg, SC» — ключ и подпись одновременно. */
  key: string
  origin: string
  destination: string
  loads: number
  /** Сумма ставок по всем рейсам направления. */
  gross: number
  /** Сумма чистой прибыли — то, что осталось после всех расходов. */
  net: number
  /** Средняя ставка за рейс. */
  avgRate: number
  /** Ставка за милю по направлению: весь гросс ÷ все мили. Не среднее от средних —
   * так короткий рейс не перевешивает длинный. */
  rpm: number
  /** Средняя чистая за рейс — по ней и решают, брать ли такое ещё. */
  avgNet: number
  /** Последний рейс по этому направлению, ISO. */
  lastAt: string | null
}

/** Города в ключ приводим к одному виду: «DALLAS, TX» и «Dallas, TX» — одно
 * направление, и складывать их порознь значит не увидеть ни одного повтора. */
const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

export type PricedLoad = { load: LoadRecord; net: number; miles: number }

/**
 * Свести грузы в направления. Отменённые и черновики не считаются: по ним никто не
 * ехал и никто не платил, а в средних они тянули бы цифры вниз.
 */
export function lanes(rows: PricedLoad[]): Lane[] {
  const acc = new Map<string, Lane & { milesTotal: number }>()

  for (const { load, net, miles } of rows) {
    if (load.status === 'cancelled' || load.status === 'quoted') continue
    if (!load.origin || !load.destination) continue
    const key = `${norm(load.origin)}→${norm(load.destination)}`
    const at = load.pickupDate ?? load.createdAt ?? null

    const cur = acc.get(key)
    if (!cur) {
      acc.set(key, {
        key,
        origin: load.origin,
        destination: load.destination,
        loads: 1,
        gross: load.rate,
        net,
        avgRate: load.rate,
        rpm: 0,
        avgNet: net,
        lastAt: at,
        milesTotal: miles,
      })
      continue
    }
    cur.loads += 1
    cur.gross += load.rate
    cur.net += net
    cur.milesTotal += miles
    if (at && (!cur.lastAt || at > cur.lastAt)) cur.lastAt = at
  }

  return [...acc.values()]
    .map((l) => ({
      key: l.key,
      origin: l.origin,
      destination: l.destination,
      loads: l.loads,
      gross: l.gross,
      net: l.net,
      avgRate: l.gross / l.loads,
      rpm: l.milesTotal > 0 ? l.gross / l.milesTotal : 0,
      avgNet: l.net / l.loads,
      lastAt: l.lastAt,
    }))
    // Сначала то, что принесло больше всего денег: направление с одним удачным рейсом
    // не должно стоять выше того, которое кормит парк каждую неделю.
    .sort((a, b) => b.net - a.net)
}

/** Повторяющиеся направления — те, где рейсов больше одного. Именно по ним решение
 * «брать ещё или нет» имеет смысл: единичный рейс ещё ничего не говорит. */
export function repeatLanes(all: Lane[]): Lane[] {
  return all.filter((l) => l.loads > 1)
}
