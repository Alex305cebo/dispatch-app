import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadInfoText } from './load-info.ts'

const base = {
  driverInfo: null,
  referenceId: '1558428',
  origin: 'Manteno, IL',
  destination: 'Aurora, CO',
  pickupAddress: '8374 N 4000 East Road, Manteno, IL 60950',
  deliveryAddress: null,
  pickupDate: '2026-10-24',
  pickupTime: '15:00',
  deliveryDate: '2026-10-26',
  deliveryTime: null,
  rate: 3400,
}

test('груз из рейт-кона — его текст водителю', () => {
  assert.equal(loadInfoText({ ...base, driverInfo: 'LOAD ID: #1\n\nRate: $1.00' }), 'LOAD ID: #1\n\nRate: $1.00')
})

test('груз руками — тот же вид из полей', () => {
  const s = loadInfoText(base)
  assert.match(s, /^LOAD ID: #1558428\n\nPick up Address:\n\n8374 N 4000 East Road, Manteno, IL 60950\n\n_+\nTime: 10\/24\/26 15:00/)
  assert.match(s, /Delivery Address:\n\nAurora, CO\n\n_+\nTime: 10\/26\/26/)
  assert.match(s, /Rate: \$3,400\.00$/)
})

test('время с датой не дублирует дату', () => {
  assert.match(loadInfoText({ ...base, pickupTime: '10/24/26 15:00 FCFS' }), /Time: 10\/24\/26 15:00 FCFS\n/)
})
