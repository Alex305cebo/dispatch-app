import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rcWarnings } from './rc-warnings.ts'
import type { RateConFields } from './ratecon.ts'

/** Поля не участвуют в проверке текста — здесь важен только он. Ставка и мили
 * заполнены, чтобы не примешивались предупреждения о них. */
const FIELDS = {
  rate: { value: 4000, evidence: '' },
  loadedMiles: { value: 2000, evidence: '' },
} as unknown as RateConFields

const texts = (raw: string) => rcWarnings(FIELDS, raw, 'en').map((w) => w.text)
const has = (raw: string, part: string) => texts(raw).some((t) => t.toLowerCase().includes(part))

// Настоящий кусок листа TQL, на котором приложение подняло ложную тревогу.
const TQL = `LOAD INFORMATION Mode Trailer Type Trailer Size Temperature Pallet/Case Count Hazmat
Load Requirements FTL Van 53 ft 10 pallets/232 cases Non-Hazardous Special Temp Instructions
CARRIER RESPONSIBLE FOR Unloading None w/ valid unloading receipt Pallet Exchange None
Estimated Weight 3365 PICKUPS Shed City State Zip PU# Date Time
ZINUS (SUMMERVILLE,SC) Summerville SC 29483 8/24/2026 FCFS 08:00 to 14:00
Commodity to Pick Up: Furniture Driver Load/Unload: No`

test('мебель с пометкой Non-Hazardous не объявляется опасным грузом', () => {
  assert.equal(has(TQL, 'hazmat'), false)
})

test('пустой столбец «Temperature» — не рефрижератор', () => {
  assert.equal(has(TQL, 'reefer'), false)
})

test('«Pallet Exchange: None» и «Driver Load/Unload: No» молчат', () => {
  assert.equal(has(TQL, 'pallet'), false)
  assert.equal(has(TQL, 'driver'), false)
})

test('живая очередь больше не требует взвешивания', () => {
  assert.equal(has(TQL, 'fcfs'), true, 'сама очередь — законное предупреждение')
  assert.equal(has(TQL, 'scale'), false, 'а вот scale ticket в документе не упомянут')
})

test('настоящий опасный груз по-прежнему поднимает красное', () => {
  assert.equal(has('Hazmat: Yes  UN1203 Gasoline  Class 3', 'hazmat'), true)
  assert.equal(has('HAZMAT LOAD — placards required', 'hazmat'), true)
})

test('настоящий рефрижератор и настоящее взвешивание не пропускаются', () => {
  assert.equal(has('Reefer continuous 34 F, pre-cool required', 'reefer'), true)
  assert.equal(has('Temperature: -10 F set point', 'reefer'), true)
  assert.equal(has('Scale ticket required at pickup', 'scale'), true)
})

test('одно отрицание не глушит другое упоминание в том же документе', () => {
  const mixed = 'Pallet Exchange None ... Shipper requires pallet exchange at delivery'
  assert.equal(has(mixed, 'pallet'), true)
})
