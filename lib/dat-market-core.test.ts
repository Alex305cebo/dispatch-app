import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  datEquipment,
  datState,
  stateFromPlace,
  laneMarket,
  originRate,
  marketVerdict,
  pctText,
  loadMarketRpm,
  versusMarket,
  ltStates,
  ltOf,
  regionStates,
  ltHeat,
  parseRegions,
  parseLt,
  parseFuel,
  parseTrend,
  parseHistory,
  type DatSnapshot,
} from './dat-market-core.ts'

// Живые ответы DAT Trendlines от 09/14/26 — укороченные, но той же формы.
const REGIONS_VAN = [
  { regionCode: 'SOUTHEAST', stateInRegion: ['AL', 'FL', 'GA', 'KY', 'MS', 'NC', 'SC', 'TN', 'VA', 'WV'], tripRatePerMileInDollars: 2.8 },
  { regionCode: 'NORTH', stateInRegion: ['IA', 'IL', 'IN', 'KA', 'MI', 'MN', 'MO', 'ND', 'NE', 'OH', 'SD', 'WI'], tripRatePerMileInDollars: 3.1 },
  { regionCode: 'SOUTH', stateInRegion: ['AR', 'LA', 'NM', 'OK', 'TX'], tripRatePerMileInDollars: 2.77 },
]
const LT_VAN = [
  { code: 'OH', loads: 3100, trucks: 400, ratio: 7.75 },
  { code: 'TN', loads: 2000, trucks: 420, ratio: 4.76 },
  { code: 'TX', loads: 2600, trucks: 500, ratio: 5.2 },
  // В /lt Канзас — KS (живой ответ 09/14/26), в регионах ставок — KA
  { code: 'KS', loads: 900, trucks: 150, ratio: 6.0 },
  { code: 'FL', loads: 1200, trucks: 400, ratio: 3.0 },
]

function snap(): DatSnapshot {
  return {
    equipment: 'VAN',
    at: 0,
    regions: parseRegions(REGIONS_VAN)!,
    lt: parseLt(LT_VAN)!,
    fuel: parseFuel({ when: '2026-09-07', pricePerGallonUSD: 5.97 }),
  }
}

test('тип трейлера из рейт-кона и биржи попадает в серию DAT', () => {
  assert.equal(datEquipment('Van'), 'VAN')
  assert.equal(datEquipment("53' Dry Van"), 'VAN')
  assert.equal(datEquipment('V'), 'VAN')
  assert.equal(datEquipment('Reefer 53'), 'REEFER')
  assert.equal(datEquipment('R'), 'REEFER')
  assert.equal(datEquipment("48' Flatbed"), 'FLATBED')
  assert.equal(datEquipment('Step Deck'), 'FLATBED')
  assert.equal(datEquipment('Conestoga'), 'FLATBED')
  // Своей серии у DAT нет — сравнивать не с чем, лучше промолчать
  assert.equal(datEquipment('Power Only'), null)
  assert.equal(datEquipment('Hotshot'), null)
  assert.equal(datEquipment(''), null)
  assert.equal(datEquipment(null), null)
})

test('Канзас у DAT: в регионах KA, в грузах на трак KS', () => {
  assert.equal(datState('KS'), 'KA')
  assert.equal(datState('oh'), 'OH')
  const s = snap()
  assert.equal(laneMarket(s, 'Wichita, KS', 'Dallas, TX').origin?.region?.code, 'NORTH')
  assert.equal(laneMarket(s, 'Wichita, KS', 'Dallas, TX').origin?.lt?.ratio, 6)
  // Пришлёт DAT однажды KA и в /lt — Канзас не пропадёт
  assert.equal(ltOf({ ...s, lt: parseLt([{ code: 'KA', loads: 1, trucks: 1, ratio: 4 }])! }, 'KS')?.ratio, 4)
})

test('штат из места с запятой и без', () => {
  assert.equal(stateFromPlace('Wapakoneta, OH'), 'OH')
  assert.equal(stateFromPlace('Cleveland TN 37312'), 'TN')
  assert.equal(stateFromPlace('Cleveland TN'), 'TN')
  assert.equal(stateFromPlace('Loudon, TN 37774-1234'), 'TN')
  // Место трака, где штат вендора разошёлся с координатами: настоящий — в приставке
  assert.equal(stateFromPlace('NV · 98.0mi ENE from Mammoth lakes, CA'), 'NV')
  assert.equal(stateFromPlace('1.1mi SSW from Tonopah, NV'), 'NV')
  assert.equal(stateFromPlace(''), null)
  assert.equal(stateFromPlace(null), null)
})

test('ориентир рынка — регион погрузки, регион доставки рядом', () => {
  // Живой груз TQL 38295964: Wapakoneta, OH → Cleveland, TN
  const m = laneMarket(snap(), 'Wapakoneta, OH', 'Cleveland, TN')
  assert.equal(m.origin?.region?.code, 'NORTH')
  assert.equal(m.dest?.region?.code, 'SOUTHEAST')
  assert.equal(m.rpm, 3.1)
  // Нет региона у погрузки — берём доставку, а не молчим
  assert.equal(laneMarket(snap(), 'Anchorage, AK', 'Cleveland, TN').rpm, 2.8)
  // Нет ни того ни другого — честный null
  assert.equal(laneMarket(snap(), 'Anchorage, AK', 'Honolulu, HI').rpm, null)
})

test('груз без своей рыночной ставки: ставка DAT по региону погрузки', () => {
  assert.deepEqual(originRate(snap(), 'Wapakoneta, OH'), { rpm: 3.1, region: 'North' })
  assert.deepEqual(originRate(snap(), 'Wichita, KS'), { rpm: 3.1, region: 'North' })
  // Регион доставки не подставляется — ориентир только погрузка
  assert.equal(originRate(snap(), 'Anchorage, AK'), null)
  assert.equal(originRate(snap(), null), null)
})

test('вердикт по рынку: ±10% ещё в рынке', () => {
  assert.equal(marketVerdict(3.48, 3.1).tone, 'good')
  assert.equal(marketVerdict(3.2, 3.1).tone, 'warn')
  assert.equal(marketVerdict(2.6, 3.1).tone, 'bad')
  assert.equal(Math.round(marketVerdict(3.41, 3.1).diff), 10)
})

test('процент к рынку — со знаком, как в карточке груза', () => {
  assert.equal(pctText(8.4), '+8%')
  assert.equal(pctText(-12.2), '-12%')
  assert.equal(pctText(0.3), '0%')
})

test('рыночная ставка груза: вписанная главнее DAT, иначе регион погрузки', () => {
  const s = snap()
  assert.equal(loadMarketRpm(s, { spotRpm: 2.5, origin: 'Wapakoneta, OH' }), 2.5)
  assert.equal(loadMarketRpm(s, { spotRpm: null, origin: 'Wapakoneta, OH' }), 3.1)
  assert.equal(loadMarketRpm(s, { spotRpm: 0, origin: 'Dallas, TX' }), 2.77)
  assert.equal(loadMarketRpm(s, { spotRpm: null, origin: 'Anchorage, AK' }), null)
  assert.equal(loadMarketRpm(null, { spotRpm: null, origin: 'Wapakoneta, OH' }), null)
})

test('средняя к рынку: вес — гружёные мили, грузы без рынка не участвуют', () => {
  const v = versusMarket([
    { rate: 3000, loadedMiles: 1000, market: 2.5 }, // $3.00 при рынке $2.50
    { rate: 1000, loadedMiles: 200, market: 4.0 }, // короткий дорогой: $5.00 при $4.00
    { rate: 5000, loadedMiles: 900, market: null }, // рынка нет — мимо
    { rate: 800, loadedMiles: 0, market: 3.0 }, // миль нет — мимо
  ])!
  assert.equal(v.loads, 2)
  assert.equal(Math.round(v.rpm * 100), 333) // 4000 / 1200
  assert.equal(Math.round(v.market * 100), 275) // (2.5·1000 + 4·200) / 1200
  assert.equal(Math.round(v.diff), 21)
  assert.equal(v.tone, 'good')
  assert.equal(versusMarket([{ rate: 900, loadedMiles: 500, market: null }]), null)
  assert.equal(versusMarket([]), null)
})

test('штаты для карты: горячесть от медианы, Канзас под почтовым кодом', () => {
  const states = ltStates({ ...snap(), lt: parseLt(LT_VAN.map((r) => (r.code === 'KS' ? { ...r, code: 'KA' } : r)))! })
  assert.deepEqual(states.OH, { ratio: 7.75, heat: 'hot' })
  assert.equal(states.FL?.heat, 'cold')
  assert.equal(states.KS?.ratio, 6)
  assert.equal(states.KA, undefined)
})

test('горячий штат считается от медианы серии, а не от абсолютной цифры', () => {
  const s = snap()
  assert.equal(ltHeat(s, 7.75), 'hot') // OH
  assert.equal(ltHeat(s, 3.0), 'cold') // FL
  assert.equal(ltHeat(s, 5.2), 'warm') // TX — медиана
})

test('тренд за неделю — своей серии', () => {
  // Форма живого ответа /trends от 09/14/26
  const raw = {
    vanTrends: { weekOverWeekVanLoadToTruckRatioChangeInPercentage: 22.601, weekOverWeekVanSpotRateChangeInPercentage: 3.114 },
    reeferTrends: { weekOverWeekReeferLoadToTruckRatioChangeInPercentage: 11.215, weekOverWeekReeferSpotRateChangeInPercentage: -0.5 },
    flatbedTrends: { weekOverWeekFlatbedLoadToTruckRatioChangeInPercentage: 16.811 },
  }
  assert.deepEqual(parseTrend(raw, 'VAN'), { ltWoW: 22.601, rateWoW: 3.114 })
  assert.deepEqual(parseTrend(raw, 'REEFER'), { ltWoW: 11.215, rateWoW: -0.5 })
  assert.deepEqual(parseTrend(raw, 'FLATBED'), { ltWoW: 16.811, rateWoW: null })
  assert.equal(parseTrend({ statusCode: 401 }, 'VAN'), null)
  assert.equal(parseTrend({ vanTrends: { weekOverWeekVanSpotRateChangeInPercentage: 40452 } }, 'VAN'), null)
})

test('история грузов на трак: по возрастанию, последние 52 недели', () => {
  const weeks = Array.from({ length: 60 }, (_, i) => {
    const d = new Date(Date.UTC(2025, 6, 19) + i * 7 * 86_400_000).toISOString().slice(0, 10)
    return { truckCount: 1, loadCount: 1, ratio: 5 + i / 10, weekEndingWhen: d }
  })
  const h = parseHistory({ threeYearMonthly: [], oneMonthWeekly: [...weeks].reverse() })!
  assert.equal(h.length, 52)
  assert.equal(h[0]!.when, weeks[8]!.weekEndingWhen)
  assert.equal(h[51]!.ratio, 10.9)
  // Мусорные недели выпадают, одной недели для линии мало
  assert.deepEqual(parseHistory({ oneMonthWeekly: [{ weekEndingWhen: '2026-09-12', ratio: 11.7 }, { weekEndingWhen: 'soon', ratio: 3 }] }), null)
  assert.equal(parseHistory({ statusCode: 401 }), null)
})

test('поломанный ответ DAT не превращается в цифры', () => {
  assert.equal(parseRegions(null), null)
  assert.equal(parseRegions('<!doctype html>'), null)
  // Ставка вне 0.5–15 — это не рынок
  assert.equal(parseRegions([{ regionCode: 'X', stateInRegion: ['OH'], tripRatePerMileInDollars: 40452.22 }]), null)
  assert.equal(parseRegions([{ regionCode: 'X', stateInRegion: [], tripRatePerMileInDollars: 3 }]), null)
  assert.equal(parseLt({ statusCode: 401 }), null)
  assert.equal(parseFuel({ statusCode: 401 }), null)
  assert.equal(parseFuel({ when: '2026-09-07', pricePerGallonUSD: 0 }), null)
})

test('штаты региона под его ставкой: 2 лучших, 2 средних, 2 худших', () => {
  const SE = ['AL', 'FL', 'GA', 'KY', 'MS', 'NC', 'SC', 'TN', 'VA', 'WV']
  const lt = parseLt([
    ...SE.map((code, i) => ({ code, loads: 1, trucks: 1, ratio: 10 - i })),
    ...(['TX', 'AR', 'OK', 'NM', 'LA'] as const).map((code, i) => ({ code, loads: 1, trucks: 1, ratio: 9 - i })),
    { code: 'KS', loads: 1, trucks: 1, ratio: 12 },
  ])!
  const s = { ...snap(), lt }
  const codes = (g: { code: string }[]) => g.map((x) => x.code)
  const se = regionStates(s, SE)
  assert.deepEqual([codes(se.best), codes(se.middle), codes(se.worst)], [['AL', 'FL'], ['MS', 'NC'], ['VA', 'WV']])
  // В South пять штатов: из середины — один, никто не повторяется
  const south = regionStates(s, ['AR', 'LA', 'NM', 'OK', 'TX'])
  assert.deepEqual([codes(south.best), codes(south.middle), codes(south.worst)], [['TX', 'AR'], ['OK'], ['NM', 'LA']])
  // Канзас в регионе — KA, в /lt — KS; штат без грузов на трак не показывается
  assert.deepEqual(regionStates(s, ['KA', 'ZZ']), { best: [{ code: 'KS', ratio: 12 }], middle: [], worst: [] })
})
