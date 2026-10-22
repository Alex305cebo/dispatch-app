import { test } from 'node:test'
import assert from 'node:assert/strict'
import { attachmentName, buildReport, parseRecipients, pickAttachments, reportWeek, truckWeeks, type ReportFile } from './weekly-report-core.ts'
import type { LoadRecord, TruckRecord } from './map.ts'
import type { MaintenanceRecord } from './maintenance-core.ts'

test('неделя отчёта: в воскресенье — текущая пн–вс, в понедельник — та же прошедшая', () => {
  assert.deepEqual(reportWeek('2026-10-25'), { from: '2026-10-19', to: '2026-10-25' }) // вс
  assert.deepEqual(reportWeek('2026-10-26'), { from: '2026-10-19', to: '2026-10-25' }) // пн
  assert.deepEqual(reportWeek('2026-10-22'), { from: '2026-10-12', to: '2026-10-18' }) // чт
})

test('получатели: через запятую, пробел, строку; без мусора и повторов', () => {
  assert.deepEqual(parseRecipients('A@x.com, b@y.com\nnot-mail; a@x.com'), ['a@x.com', 'b@y.com'])
  assert.deepEqual(parseRecipients(null), [])
})

const truck = (id: number, number: string): TruckRecord => ({
  id,
  name: `Truck ${number}`,
  number,
  driverName: 'Juan Perez',
  unavailable: null,
  mpg: 6.5,
  fuelPricePerGallon: 4,
  driverPay: { mode: 'cpm', centsPerMile: 60 },
  truckPaymentPerDay: 60,
  insurancePerDay: 40,
  eldPermitsPerDay: 8,
  maintenanceCostPerMile: 0.15,
  factoringPercent: 2,
  dispatchPercent: 0,
})

const load = (id: number, truckId: number, pickup: string, delivery: string, rate: number, miles: number, status = 'delivered'): LoadRecord =>
  ({ id, truckId, status, rate, loadedMiles: miles, deadheadMiles: 50, transitDays: 1, tolls: 0, pickupDate: pickup, deliveryDate: delivery, origin: 'DALLAS, TX', destination: 'ATLANTA, GA', brokerName: 'TQL', referenceId: '123' }) as unknown as LoadRecord

const rec = (id: number, truckId: number, doneAt: string, title: string, cost: number, isOil = false): MaintenanceRecord => ({
  id, truckId, kind: isOil ? 'service' : 'repair', title, notes: null, cost, odometer: 410000, doneAt, doneTime: '10:15', shop: 'Love\'s', isOil,
})

const week = { from: '2026-10-19', to: '2026-10-25' }

test('траки: грузы по пикапу, клетки по рейсу, заявки и отмены не в счёт', () => {
  const loads = [
    load(1, 1, '2026-10-17', '2026-10-20', 2000, 900), // начат на прошлой неделе — клетки пн–вт, но не груз недели
    load(2, 1, '2026-10-21', '2026-10-22', 1500, 600),
    load(3, 1, '2026-10-23', '2026-10-23', 900, 300, 'quoted'),
    load(4, 2, '2026-10-24', '2026-10-25', 3000, 1000, 'cancelled'),
  ]
  const [a, b] = truckWeeks({ week, trucks: [truck(1, '101'), truck(2, '202')], loads, maintenance: [] })
  assert.equal(a!.truck.id, 1)
  assert.deepEqual(a!.loads.map((l) => l.id), [2])
  assert.deepEqual(a!.days, [true, true, true, true, false, false, false])
  assert.equal(a!.gross, 1500)
  assert.equal(a!.rpm, 1500 / 650)
  assert.equal(b!.loads.length, 0)
  assert.equal(b!.rpm, null)
})

test('письмо: тема с неделей и гроссом, ремонт и масло в таблице, без опасного HTML', () => {
  const r = buildReport({
    week,
    company: 'Maya <Logistics>',
    appUrl: 'https://app.example.com/',
    trucks: [truck(1, '101')],
    loads: [load(2, 1, '2026-10-21', '2026-10-22', 1500, 600)],
    maintenance: [rec(7, 1, '2026-10-21', 'Oil change', 320, true), rec(8, 1, '2026-10-23', 'Brake chamber', 450)],
    odometer: new Map([[1, 412000]]),
    oil: new Map(),
    files: [{ id: 5, truckId: 1, maintenanceId: 7, kind: 'repair', title: 'Receipt', mime: 'application/pdf', sizeBytes: 2048, uploadedAt: '2026-10-21T15:00:00Z' }],
    skipped: [],
  })
  assert.match(r.subject, /10\/19\/26 – 10\/25\/26 · \$1,500/)
  assert.ok(r.html.includes('Maya &lt;Logistics&gt;'))
  assert.ok(r.html.includes('https://app.example.com/loads/2'))
  assert.ok(r.html.includes('Масло') && r.html.includes('Ремонт') && r.html.includes('$770'))
  assert.ok(r.text.includes('101'))
})

test('вложения: до предела по порядку, остальное списком', () => {
  const f = (id: number, size: number): ReportFile => ({ id, truckId: 1, maintenanceId: null, kind: 'repair', title: 'x', mime: 'image/jpeg', sizeBytes: size, uploadedAt: '' })
  const { attach, skip } = pickAttachments([f(1, 6), f(2, 6), f(3, 3)], 10)
  assert.deepEqual(attach.map((x) => x.id), [1, 3])
  assert.deepEqual(skip.map((x) => x.id), [2])
})

test('имя вложения: расширение по типу, без запрещённых знаков', () => {
  assert.equal(attachmentName({ id: 1, title: 'Receipt: LubeZone/Sayre', mime: 'image/jpeg' }), 'Receipt LubeZone Sayre.jpg')
  assert.equal(attachmentName({ id: 2, title: 'invoice.pdf', mime: 'application/pdf' }), 'invoice.pdf')
  assert.equal(attachmentName({ id: 3, title: '', mime: 'application/pdf' }), 'doc-3.pdf')
})
