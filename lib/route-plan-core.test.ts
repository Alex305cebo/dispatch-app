import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseLt, parseRegions, type DatSnapshot } from './dat-market-core.ts'
import { bestWorst, dayTone, parseBoardLoads, rankLanes, roadMiles, scoreLane, waitDays, type PlanOptions } from './route-plan-core.ts'
import type { TruckSettings } from './profit.ts'

// Регионы DAT Van (форма живого ответа 09/14/26) и грузы на трак по нескольким штатам.
const snap: DatSnapshot = {
  equipment: 'VAN',
  at: 0,
  regions: parseRegions([
    { regionCode: 'SOUTHEAST', stateInRegion: ['AL', 'FL', 'GA', 'KY', 'MS', 'NC', 'SC', 'TN', 'VA', 'WV'], tripRatePerMileInDollars: 2.8 },
    { regionCode: 'NORTH', stateInRegion: ['IA', 'IL', 'IN', 'KA', 'MI', 'MN', 'MO', 'ND', 'NE', 'OH', 'SD', 'WI'], tripRatePerMileInDollars: 3.1 },
    { regionCode: 'NORTHEAST', stateInRegion: ['CT', 'DC', 'DE', 'MA', 'MD', 'ME', 'NH', 'NJ', 'NY', 'PA', 'RI', 'VT'], tripRatePerMileInDollars: 2.73 },
    { regionCode: 'SOUTH', stateInRegion: ['AR', 'LA', 'NM', 'OK', 'TX'], tripRatePerMileInDollars: 2.77 },
    { regionCode: 'WEST', stateInRegion: ['AZ', 'CA', 'CO', 'ID', 'MT', 'NV', 'OR', 'UT', 'WA', 'WY'], tripRatePerMileInDollars: 2.86 },
  ])!,
  lt: parseLt([
    { code: 'OH', loads: 11908, trucks: 804, ratio: 14.8 },
    { code: 'PA', loads: 5000, trucks: 254, ratio: 19.7 },
    { code: 'IL', loads: 6000, trucks: 720, ratio: 8.3 },
    { code: 'TX', loads: 9000, trucks: 1290, ratio: 7.0 },
    { code: 'GA', loads: 4000, trucks: 530, ratio: 7.5 },
    { code: 'FL', loads: 3000, trucks: 500, ratio: 6.0 },
    { code: 'CA', loads: 7000, trucks: 790, ratio: 8.9 },
    { code: 'MN', loads: 2000, trucks: 220, ratio: 9.1 },
    { code: 'KS', loads: 1327, trucks: 185, ratio: 7.2 },
    { code: 'MT', loads: 300, trucks: 150, ratio: 2.0 },
  ])!,
  fuel: null,
}

// Трак с водителем за мили — как у большинства в TMS.
const truck: TruckSettings = {
  mpg: 6.5,
  fuelPricePerGallon: 3.8,
  driverPay: { mode: 'cpm', centsPerMile: 60 },
  truckPaymentPerDay: 60,
  insurancePerDay: 45,
  eldPermitsPerDay: 10,
  maintenanceCostPerMile: 0.2,
  factoringPercent: 3,
  dispatchPercent: 5,
}
const opts: PlanOptions = { settings: truck, milesPerDay: 500, deadhead: 50 }

test('мили между штатами похожи на дорожные', () => {
  // Чикаго — Даллас по дорогам ~925 миль; точки штатов не города, но порядок тот же
  const il: [number, number] = [40.0, -89.2]
  const tx: [number, number] = [31.5, -99.3]
  const miles = roadMiles(il, tx)
  assert.ok(miles > 700 && miles < 1100, String(miles))
})

test('простой в штате доставки — от медианы серии', () => {
  assert.equal(waitDays(9, 9), 1)
  assert.ok(waitDays(18, 9) < waitDays(9, 9) && waitDays(9, 9) < waitDays(4.5, 9))
  // Вдвое горячее — на полдня меньше
  assert.ok(Math.abs(waitDays(18, 9) - (1 - 0.75 * Math.log(2))) < 1e-9)
  assert.equal(waitDays(900, 9), 0.3)
  assert.equal(waitDays(0, 9), 3)
  // Медианы нет — день, а не NaN
  assert.equal(waitDays(5, 0), 1)
})

test('горячий штат доставки выгоднее холодного при тех же милях и ставке', () => {
  const board = { miles: 800, rate: 2400 }
  const hot = scoreLane(snap, { state: 'IL' }, 'PA', opts, board)! // 19.7 грузов на трак
  const cold = scoreLane(snap, { state: 'IL' }, 'FL', opts, board)! // 6.0
  assert.equal(hot.heat, 'hot')
  assert.equal(cold.heat, 'cold')
  assert.ok(hot.wait < cold.wait)
  assert.ok(hot.grossPerDay > cold.grossPerDay)
  assert.ok(hot.netPerDay > cold.netPerDay)
})

test('жирная ставка в мёртвый рынок проигрывает скромной в живой', () => {
  // $3.00/mi в Монтану, где грузов на трак вчетверо меньше медианы, против $2.60/mi в
  // Пенсильванию: за милю первый дороже, за цикл — нет, трак двое суток стоит
  const trap = scoreLane(snap, { state: 'GA' }, 'MT', opts, { miles: 1000, rate: 3000 })!
  const alive = scoreLane(snap, { state: 'GA' }, 'PA', opts, { miles: 1000, rate: 2600 })!
  assert.ok(trap.rpm > alive.rpm)
  assert.ok(trap.wait > 2)
  assert.ok(alive.netPerDay > trap.netPerDay * 1.1, `${trap.netPerDay} vs ${alive.netPerDay}`)
  // А просто прохладный рынок (Флорида) лишние $400 за груз окупают: формула не
  // наказывает за любой простой, только за долгий
  const cool = scoreLane(snap, { state: 'GA' }, 'FL', opts, { miles: 1000, rate: 3000 })!
  assert.ok(cool.netPerDay > alive.netPerDay)
})

test('простой стоит денег: постоянные расходы трака за дни ожидания', () => {
  const lane = scoreLane(snap, { state: 'IL' }, 'FL', opts, { miles: 800, rate: 2400 })!
  assert.ok(Math.abs(lane.idleCost - lane.wait * (60 + 45 + 10)) < 1e-9)
  assert.ok(Math.abs(lane.net - (lane.load.net + 0.5 * lane.next!.net - lane.idleCost)) < 1e-9)
  // Следующее плечо — по ставке региона доставки (Southeast $2.80)
  assert.equal(lane.nextRpm, 2.8)
  assert.equal(lane.next!.gross, 600 * 2.8)
})

test('направления из штата: без него самого, без Аляски и Гавайев, лучшие сверху', () => {
  const lanes = rankLanes(snap, { state: 'IL' }, opts)
  assert.ok(lanes.length > 40)
  assert.ok(!lanes.some((l) => l.state === 'IL' || l.state === 'AK' || l.state === 'HI'))
  assert.ok(lanes.every((l) => l.miles >= 150))
  assert.ok(lanes.every((l, i) => i === 0 || lanes[i - 1]!.grossPerDay >= l.grossPerDay))
  // Ставка направления — DAT региона погрузки (North $3.10)
  assert.ok(lanes.every((l) => Math.abs(l.rpm - 3.1) < 0.01))
  // Канзас в /lt — KS, в регионах — KA: направление в Канзас есть и с соотношением
  assert.equal(lanes.find((l) => l.state === 'KS')?.ratio, 7.2)
})

test('точка трака по GPS меняет мили, штат остаётся тем же', () => {
  const byState = scoreLane(snap, { state: 'IL' }, 'TX', opts)!
  const chicago = scoreLane(snap, { state: 'IL', ll: [41.88, -87.63] }, 'TX', opts)!
  assert.ok(chicago.miles > byState.miles)
})

test('нет ставки региона погрузки или поломаны настройки трака — не падаем', () => {
  assert.equal(scoreLane(snap, { state: 'AK' }, 'TX', opts), null)
  assert.deepEqual(rankLanes(snap, { state: 'IL' }, { ...opts, settings: { ...truck, mpg: 0 } }), [])
  assert.equal(scoreLane(snap, { state: 'IL' }, 'XX', opts), null)
})

test('цель выручки в день', () => {
  assert.equal(dayTone(1300, 1300), 'hit')
  assert.equal(dayTone(1200, 1300), 'near')
  assert.equal(dayTone(1000, 1300), 'miss')
})

test('грузы с доски строками', () => {
  assert.deepEqual(parseBoardLoads('TX 980 2450 60\nga 640 $1,700\nмусор\nXX 500 1500\nOH 0 900\n  PA  420  1,260 '), [
    { state: 'TX', miles: 980, rate: 2450, deadhead: 60 },
    { state: 'GA', miles: 640, rate: 1700 },
    { state: 'PA', miles: 420, rate: 1260 },
  ])
  // «?» — ставки на доске нет; всё после чисел — подпись груза.
  assert.deepEqual(parseBoardLoads('NV 139 ? 102 · W Sacramento, CA → Sparks, NV · TQL\nGA 781 ? · Dallas, TX\nTX 980 2450 60 Dallas\nca-tx\nOH 500 0'), [
    { state: 'NV', miles: 139, rate: null, deadhead: 102, label: 'W Sacramento, CA → Sparks, NV · TQL' },
    { state: 'GA', miles: 781, rate: null, label: 'Dallas, TX' },
    { state: 'TX', miles: 980, rate: 2450, deadhead: 60, label: 'Dallas' },
  ])
})

test('хуже всего — штат, где трак застрянет (самый холодный), а не короткий сосед', () => {
  const lanes = rankLanes(snap, { state: 'IL' }, opts)
  const { best, worst } = bestWorst(lanes, opts.milesPerDay)
  assert.ok(best && worst)
  assert.ok(best.miles + best.deadhead > opts.milesPerDay)
  // самый холодный штат фикстуры — MT (2.0 груза на трак): там ждать дольше всех
  assert.equal(worst.state, 'MT')
  assert.ok(lanes.every((l) => l.wait <= worst.wait))
})

test('профиль водителя: стоп-лист вырезан, домашний штат помечен и первым, когда домой скоро', () => {
  const all = rankLanes(snap, { state: 'IL' }, opts)
  assert.ok(all.some((l) => l.state === 'CA') && all.some((l) => l.state === 'TX'))
  const cut = rankLanes(snap, { state: 'IL' }, { ...opts, avoid: ['CA', 'TX'] })
  assert.ok(!cut.some((l) => l.state === 'CA' || l.state === 'TX'))
  assert.equal(cut.length, all.length - 2)
  const home = rankLanes(snap, { state: 'IL' }, { ...opts, homeState: 'MT' })
  assert.equal(home.find((l) => l.state === 'MT')?.home, true)
  assert.notEqual(home[0]!.state, 'MT') // холодный штат по деньгам не первый
  const soon = rankLanes(snap, { state: 'IL' }, { ...opts, homeState: 'MT', preferHome: true })
  assert.equal(soon[0]!.state, 'MT')
  assert.equal(soon.length, home.length)
})
