import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  datEquipment,
  datState,
  stateFromPlace,
  laneMarket,
  marketVerdict,
  ltHeat,
  parseRegions,
  parseLt,
  parseFuel,
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
  { code: 'KA', loads: 900, trucks: 150, ratio: 6.0 },
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

test('Канзас у DAT — KA, а не KS', () => {
  assert.equal(datState('KS'), 'KA')
  assert.equal(datState('oh'), 'OH')
  const s = snap()
  assert.equal(laneMarket(s, 'Wichita, KS', 'Dallas, TX').origin?.region?.code, 'NORTH')
  assert.equal(laneMarket(s, 'Wichita, KS', 'Dallas, TX').origin?.lt?.ratio, 6)
})

test('штат из места с запятой и без', () => {
  assert.equal(stateFromPlace('Wapakoneta, OH'), 'OH')
  assert.equal(stateFromPlace('Cleveland TN 37312'), 'TN')
  assert.equal(stateFromPlace('Cleveland TN'), 'TN')
  assert.equal(stateFromPlace('Loudon, TN 37774-1234'), 'TN')
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

test('вердикт по рынку: ±10% ещё в рынке', () => {
  assert.equal(marketVerdict(3.48, 3.1).tone, 'good')
  assert.equal(marketVerdict(3.2, 3.1).tone, 'warn')
  assert.equal(marketVerdict(2.6, 3.1).tone, 'bad')
  assert.equal(Math.round(marketVerdict(3.41, 3.1).diff), 10)
})

test('горячий штат считается от медианы серии, а не от абсолютной цифры', () => {
  const s = snap()
  assert.equal(ltHeat(s, 7.75), 'hot') // OH
  assert.equal(ltHeat(s, 3.0), 'cold') // FL
  assert.equal(ltHeat(s, 5.2), 'warm') // TX — медиана
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
