import test from 'node:test'
import assert from 'node:assert/strict'
import {
  arrivedAt,
  eventSeq,
  isDone,
  mergeStops,
  nextOpenStop,
  stopTitle,
  stopsFrom,
  viaLabel,
  type LoadStop,
  type StopSource,
} from './stops.ts'

const legacy: StopSource = {
  stops: null,
  origin: 'Olathe, KS',
  destination: 'Caldwell, ID',
  pickupAddress: '510 W Frontier Ln, 66061',
  deliveryAddress: '1311 N 3rd Ave, 83606',
  pickupDate: '2026-09-10',
  deliveryDate: '2026-09-14',
  pickupTime: '8am-3pm',
  deliveryTime: '8-9am',
}

const three: LoadStop[] = [
  {
    seq: 1,
    role: 'pickup',
    name: 'United Rotary Brush',
    address: '510 W Frontier Ln, Olathe, KS 66061',
    city: 'Olathe, KS',
    date: '2026-09-10',
    time: '8am-3pm',
    refs: [],
  },
  {
    seq: 2,
    role: 'delivery',
    name: 'Michael Todd',
    address: '8948 J St, Omaha, NE 68127',
    city: 'Omaha, NE',
    date: '2026-09-11',
    time: null,
    refs: ['CO326166'],
  },
  {
    seq: 3,
    role: 'delivery',
    name: 'City of Caldwell',
    address: '1311 N 3rd Ave, Caldwell, ID 83606',
    city: 'Caldwell, ID',
    date: '2026-09-14',
    time: '8-9am',
    refs: ['CO325918'],
  },
]

test('старый груз без JSON — две точки из колонок', () => {
  const s = stopsFrom(legacy, { pickup: 'Shipper Inc' })
  assert.equal(s.length, 2)
  assert.equal(s[0]!.role, 'pickup')
  assert.equal(s[0]!.name, 'Shipper Inc')
  assert.equal(s[1]!.city, 'Caldwell, ID')
  assert.equal(viaLabel(s, 'ru'), null)
})

test('старые отметки без номера относятся к первому пикапу и последней выгрузке', () => {
  assert.equal(eventSeq({ kind: 'arrived_pickup', at: 'x' }, three), 1)
  assert.equal(eventSeq({ kind: 'delivered', at: 'x' }, three), 3)
  assert.equal(eventSeq({ kind: 'delivered', at: 'x', stopSeq: 2 }, three), 2)
  assert.equal(eventSeq({ kind: 'note', at: 'x' }, three), null)
})

test('следующая остановка — первая непройденная; «приехал» без «выгрузился» = стоит там', () => {
  const ev = [
    { kind: 'arrived_pickup', at: '2026-09-10T13:00:00Z', stopSeq: 1 },
    { kind: 'loaded', at: '2026-09-10T15:00:00Z', stopSeq: 1 },
    { kind: 'arrived_delivery', at: '2026-09-11T14:00:00Z', stopSeq: 2 },
  ]
  assert.equal(nextOpenStop(three, ev)?.seq, 2)
  assert.ok(arrivedAt(three[1]!, ev, three))
  assert.equal(arrivedAt(three[0]!, ev, three), null)
  assert.equal(isDone(three[0]!, ev, three), true)
  const done = [
    ...ev,
    { kind: 'delivered', at: '2026-09-11T16:00:00Z', stopSeq: 2 },
    { kind: 'delivered', at: '2026-09-14T10:00:00Z', stopSeq: 3 },
  ]
  assert.equal(nextOpenStop(three, done), null)
})

test('подписи: номер только когда точек одной роли несколько; «через» — середина', () => {
  assert.equal(stopTitle(three[0]!, three, 'en'), 'Pickup')
  assert.equal(stopTitle(three[1]!, three, 'en'), 'Delivery 1')
  assert.equal(stopTitle(three[2]!, three, 'en'), 'Delivery 2')
  assert.equal(viaLabel(three, 'en'), 'via Omaha, NE')
})

test('партиалы: одна лента по дате и времени окна', () => {
  const a = { ...legacy, id: 1, referenceId: 'A', brokerName: 'TQL', stops: three }
  const b: StopSource & { id: number; referenceId: string | null; brokerName: string | null } = {
    ...legacy,
    id: 2,
    referenceId: 'B',
    brokerName: 'Echo',
    stops: null,
    origin: 'Kansas City, MO',
    destination: 'Boise, ID',
    pickupDate: '2026-09-10',
    pickupTime: '6am',
    deliveryDate: '2026-09-13',
    deliveryTime: null,
  }
  const m = mergeStops([a, b])
  assert.deepEqual(
    m.map((s) => `${s.loadId}:${s.seq}`),
    ['2:1', '1:1', '1:2', '2:2', '1:3'],
  )
  assert.equal(m[0]!.broker, 'Echo')
})

test('партиал разных брокеров: точки обоих грузов идут одной лентой по датам и окнам', () => {
  // Реальный случай: Tallgrass 620042 (три точки) и партиал Trinity 9843282 (две),
  // оба в одном трейлере. Порядок — по дате, внутри дня по окну приёмки, но в одном
  // городе выгрузка всегда идёт перед погрузкой: партиал грузят в освободившееся место.
  const tallgrass = {
    id: 1779, referenceId: '620042', brokerName: 'Tallgrass', origin: 'Olathe, KS', destination: 'Caldwell, ID',
    pickupAddress: null, deliveryAddress: null, pickupDate: null, deliveryDate: null, pickupTime: null, deliveryTime: null,
    stops: [
      { seq: 1, role: 'pickup' as const, name: null, address: null, city: 'Olathe, KS', date: '2026-09-10', time: '8am-3pm', refs: [] },
      { seq: 2, role: 'delivery' as const, name: null, address: null, city: 'Omaha, NE', date: '2026-09-11', time: null, refs: [] },
      { seq: 3, role: 'delivery' as const, name: null, address: null, city: 'Caldwell, ID', date: '2026-09-14', time: '8-9am', refs: [] },
    ],
  }
  const trinity = {
    id: 1869, referenceId: '9843282', brokerName: 'Trinity', origin: 'Omaha, NE', destination: 'Ketchum, ID',
    pickupAddress: null, deliveryAddress: null, pickupDate: '2026-09-11', deliveryDate: '2026-09-14',
    pickupTime: '07:00 - 15:30', deliveryTime: '07:00 - 15:30', stops: null,
  }
  const merged = mergeStops([tallgrass, trinity])
  assert.deepEqual(merged.map((s) => [s.loadId, s.city]), [
    [1779, 'Olathe, KS'],
    // Омаха 11.09: сначала выгрузка Tallgrass, потом погрузка партиала в
    // освободившееся место — хотя окно погрузки в бумагах начинается раньше.
    [1779, 'Omaha, NE'],
    [1869, 'Omaha, NE'],
    [1869, 'Ketchum, ID'],
    [1779, 'Caldwell, ID'],
  ])
  // Пройденность считается по отметкам СВОЕГО груза: выгрузка Омахи отмечена
  // у Tallgrass и не делает пройденной погрузку партиала в том же городе.
  const done = merged.filter((s) => isDone(s, s.loadId === 1779 ? [{ kind: 'delivered', at: '2026-09-11', stopSeq: 2 }] : [], stopsFrom(s.loadId === 1779 ? tallgrass : trinity)))
  assert.deepEqual(done.map((s) => [s.loadId, s.city]), [[1779, 'Omaha, NE']])
})
