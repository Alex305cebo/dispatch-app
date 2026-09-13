import test from 'node:test'
import assert from 'node:assert/strict'
import { aiToFields, type AiFields } from './ratecon-ai-contract.ts'
import { formatDriverInfo } from './ratecon.ts'
import { stopNames } from './driver-info-zip.ts'

// Настоящий рейт-кон 620042 (Tallgrass): один пикап, две выгрузки.
const AI: AiFields = {
  stops: [
    {
      role: 'pickup',
      company: 'United Rotary Brush - NEW OLATHE',
      street: '510 W. Frontier Lane',
      city: 'Olathe',
      state: 'KS',
      zip: '66061',
      time: '09/10/2026 8am-3pm',
      refs: [],
    },
    {
      role: 'delivery',
      company: 'Michael Todd - New',
      street: '8948 J Street',
      city: 'Omaha',
      state: 'NE',
      zip: '68127',
      time: '09/11/2026',
      refs: ['CO326166', '95300'],
    },
    {
      role: 'delivery',
      company: 'City of Caldwell',
      street: '1311 N 3rd Ave',
      city: 'Caldwell',
      state: 'ID',
      zip: '83606',
      time: '09/14/2026 8-9am',
      refs: ['CO325918'],
    },
  ],
  rate: 5300,
  referenceId: '620042',
  brokerName: 'Tallgrass Freight Co.',
  pickupDate: '09/10/2026',
  deliveryDate: '09/14/2026',
}

test('все остановки сохраняются по порядку, концы рейса — первый пикап и последняя выгрузка', () => {
  const f = aiToFields(AI, 'test')
  assert.equal(f.stops?.length, 3)
  assert.deepEqual(
    f.stops!.map((s) => `${s.seq}:${s.role}:${s.city}`),
    ['1:pickup:Olathe, KS', '2:delivery:Omaha, NE', '3:delivery:Caldwell, ID'],
  )
  assert.equal(f.stops![1]!.date, '2026-09-11')
  assert.equal(f.stops![1]!.name, 'Michael Todd - New')
  assert.equal(f.origin?.value, 'Olathe, KS')
  assert.equal(f.destination?.value, 'Caldwell, ID')
  assert.match(f.deliveryStop.block ?? '', /City of Caldwell/)
})

test('текст водителю — блок на каждую остановку, выгрузки пронумерованы, названия читаются обратно', () => {
  const out = formatDriverInfo(aiToFields(AI, 'test'))
  assert.match(out, /^Pick up Address:$/m)
  assert.match(out, /^Delivery 1 Address:$/m)
  assert.match(out, /^Delivery 2 Address:$/m)
  assert.match(out, /Michael Todd - New\n\n8948 J Street, Omaha, NE 68127/)
  assert.match(out, /Ref: CO326166\nCO325918|Ref: CO326166\n95300/)
  const names = stopNames(out)
  assert.equal(names.pickup, 'United Rotary Brush - NEW OLATHE')
  assert.equal(names.delivery, 'City of Caldwell')
})

// Настоящий Load Info TQL 38295964: у выгрузки в Cleveland, TN — маршрут к складу.
const TQL: AiFields = {
  stops: [
    { role: 'pickup', company: 'PRATT PAPER (WAPAKONETA, OH)', street: '12860 DIXIE HWY', city: 'Wapakoneta', state: 'OH', zip: '45895', time: '9/13/2026 FCFS 07:00 to 22:00', refs: ['17093609'], directions: "24/7 Shipping, FCFS If shipper looks closed, you're in the wrong place." },
    { role: 'delivery', company: 'SHEETS TRIUMPH SHEETS (CLEVELAND, TN)', street: '4100 Old Tasso Rd NE', city: 'Cleveland', state: 'TN', zip: '37312', time: '9/14/2026 Appt 09:00', refs: ['17093609'], directions: 'ga 85-n, 1-75s keep left at the fork and follow signs for i-75 n/atlanta\n take exit 20 towards us-64 E/cleveland, turn left at 20th st NE take the 2nd left onto Old Tasso Road.' },
  ],
  rate: 1650,
  referenceId: '38295964',
  brokerName: 'TQL',
}

test('указания «как заехать» идут в остановки и в текст водителю сразу под адресом', () => {
  const f = aiToFields(TQL, 'test')
  assert.equal(f.stops?.[1]?.directions?.includes('\n'), false)
  assert.match(f.stops?.[1]?.directions ?? '', /^ga 85-n, 1-75s keep left .* onto Old Tasso Road\.$/)
  const out = formatDriverInfo(f)
  // под адресом выгрузки, раньше строки со временем
  assert.match(out, /Cleveland, TN 37312\n\n_+\n⚠ DIRECTIONS \(follow these, not GPS\): ga 85-n[^\n]*Old Tasso Road\.\n_+\nTime: 9\/14\/2026 Appt 09:00/)
  assert.match(out, /⚠ DIRECTIONS \(follow these, not GPS\): 24\/7 Shipping, FCFS If shipper looks closed, you're in the wrong place\./)
})
