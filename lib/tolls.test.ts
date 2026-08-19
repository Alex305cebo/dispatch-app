import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compareRoutes, parseHereRoute, DEFAULT_TRUCK, type TollQuote } from './tolls.ts'

// Форма ответа взята из документации HERE (routing-v8-tolls-for-route): две секции,
// в одной платный участок с местной ценой и пересчётом в доллары.
const HERE_ANSWER = {
  routes: [
    {
      sections: [
        {
          summary: { length: 160_934, duration: 7200 },
          polyline: 'BFoz5xJ67i1B1B7PzIhaxL7Y',
          tolls: [
            {
              countryCode: 'USA',
              tollSystem: 'INDIANA TOLL ROAD',
              fares: [
                {
                  name: 'Indiana Toll Road',
                  price: { type: 'value', currency: 'USD', value: 42.5 },
                  paymentMethods: ['transponder', 'video'],
                },
              ],
            },
          ],
        },
        {
          summary: { length: 80_467, duration: 3600 },
          tolls: [
            {
              countryCode: 'CAN',
              tollSystem: 'HWY 407 ETR',
              fares: [
                {
                  name: '407 ETR',
                  price: { type: 'value', currency: 'CAD', value: 20 },
                  convertedPrice: { type: 'value', currency: 'USD', value: 14.6 },
                  paymentMethods: ['video'],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}

const decode = (s: string) => (s ? ([[41.8, -87.6]] as [number, number][]) : [])

test('складывает длину, время и толлы по всем секциям маршрута', () => {
  const q = parseHereRoute(HERE_ANSWER, decode)!
  assert.equal(q.miles, 150) // 241 401 м
  assert.equal(q.minutes, 180)
  assert.equal(q.fares.length, 2)
  assert.equal(q.total, 57.1) // 42.50 + 14.60
})

test('канадский участок берётся в пересчитанных долларах, а не в местной валюте', () => {
  const q = parseHereRoute(HERE_ANSWER, decode)!
  const etr = q.fares.find((f) => f.system === 'HWY 407 ETR')!
  assert.equal(etr.amount, 14.6)
  assert.equal(etr.currency, 'USD')
})

test('способ оплаты сохраняется — по нему цена и различается', () => {
  const q = parseHereRoute(HERE_ANSWER, decode)!
  assert.deepEqual(q.fares[0]!.methods, ['transponder', 'video'])
})

test('ответ без маршрутов даёт null, а не пустую поездку', () => {
  assert.equal(parseHereRoute({}, decode), null)
  assert.equal(parseHereRoute({ routes: [] }, decode), null)
})

const quote = (over: Partial<TollQuote>): TollQuote => ({
  miles: 700,
  minutes: 660,
  coords: [],
  fares: [],
  total: 0,
  currency: 'USD',
  ...over,
})

test('объезд выгоден, когда толлы дороже лишнего топлива', () => {
  const c = compareRoutes(quote({ miles: 700, total: 60 }), quote({ miles: 730, total: 0 }), 0.55)
  assert.equal(c.tollsSaved, 60)
  assert.equal(c.extraMiles, 30)
  assert.equal(c.extraCost, 16.5)
  assert.equal(c.net, 43.5)
})

test('объезд убыточен, когда крюк длиннее экономии', () => {
  const c = compareRoutes(quote({ miles: 700, total: 12 }), quote({ miles: 790, total: 0 }), 0.55)
  assert.ok(c.net < 0, 'net должен быть отрицательным')
  assert.equal(c.net, -37.5)
})

test('профиль по умолчанию — пятиосный сцеп на 80 000 фунтов', () => {
  assert.equal(DEFAULT_TRUCK.axles, 5)
  assert.equal(DEFAULT_TRUCK.grossWeightLb, 80_000)
})

// Живой ответ HERE на Филадельфия → Питтсбург (сокращён): четыре ГРУППЫ — это
// четыре пункта оплаты, их складывают. А внутри группы несколько fares — это
// альтернативы по способу оплаты за один и тот же проезд, и складывать их
// нельзя: именно на этом сумма раздувалась вчетверо.
const PA_TURNPIKE = {
  routes: [
    {
      sections: [
        {
          summary: { length: 492_000, duration: 25_000 },
          tolls: [
            {
              countryCode: 'USA',
              tollSystem: 'PA TURNPIKE 476',
              tollCollectionLocations: [{ name: 'Tredyffrin Twp' }],
              fares: [
                { name: 'PA TURNPIKE 476', price: { currency: 'USD', value: 9.42 }, paymentMethods: ['videoToll'] },
                { name: 'PA TURNPIKE 476', price: { currency: 'USD', value: 4.1 }, paymentMethods: ['transponder'] },
              ],
            },
            {
              countryCode: 'USA',
              tollSystem: 'PA TURNPIKE 476',
              tollCollectionLocations: [{ name: 'Brecknock Twp' }, { name: 'Monroeville' }],
              fares: [
                { name: 'PA TURNPIKE 476', price: { currency: 'USD', value: 285.76 }, paymentMethods: ['videoToll'] },
              ],
            },
          ],
        },
      ],
    },
  ],
}

test('альтернативы внутри одного пункта не складываются', () => {
  const q = parseHereRoute(PA_TURNPIKE, decode)!
  assert.equal(q.fares.length, 2, 'два пункта оплаты — две строки')
  assert.equal(q.total, 295.18) // 9.42 + 285.76, а НЕ 9.42 + 4.10 + 285.76
})

test('из вариантов оплаты берётся самый дорогой — ошибаться безопаснее вверх', () => {
  // В группе два тарифа за один и тот же проезд: 9.42 по номеру и 4.10 с меткой.
  // Показываем 9.42: заложить больше, чем спишется, безопасно; заложить меньше —
  // это груз, взятый по ставке, которая не окупается.
  const q = parseHereRoute(PA_TURNPIKE, decode)!
  assert.equal(q.fares[0]!.amount, 9.42)
})

test('строка называет пункт оплаты, а не систему — «PA TURNPIKE 476» повторялась бы', () => {
  const q = parseHereRoute(PA_TURNPIKE, decode)!
  assert.equal(q.fares[0]!.name, 'Tredyffrin Twp')
  assert.equal(q.fares[1]!.name, 'Brecknock Twp → Monroeville')
})

import { rankOptions } from './tolls.ts'

const opt = (miles: number, minutes: number, total: number): TollQuote => ({
  miles,
  minutes,
  coords: [],
  fares: [],
  total,
  currency: 'USD',
})

test('варианты ранжируются по ПОЛНОЙ стоимости, а не по одним толлам', () => {
  // Короткий с толлами против длинного без них. По толлам «выигрывает» второй,
  // по деньгам — первый: 90 лишних миль стоят дороже, чем $40 платных дорог.
  const ranked = rankOptions(
    [
      { quote: opt(700, 660, 40), source: 'main' },
      { quote: opt(790, 760, 0), source: 'avoid' },
    ],
    0.55,
  )
  assert.equal(ranked[0]!.miles, 700, 'первым должен идти дешевле ПО СУММЕ')
  assert.ok(ranked[0]!.badges.includes('cheapest'))
  assert.ok(ranked[1]!.badges.includes('leastTolls'), 'ярлык «меньше платных» у второго')
})

test('полная стоимость это толлы плюс пробег', () => {
  const [o] = rankOptions([{ quote: opt(1000, 900, 50), source: 'main' }], 0.6)
  assert.equal(o!.totalCost, 650) // 50 + 1000×0.6
})

test('одинаковые варианты не превращаются в три кнопки с одним ответом', () => {
  const ranked = rankOptions(
    [
      { quote: opt(700, 660, 40), source: 'main' },
      { quote: opt(700, 660, 40), source: 'alt' },
      { quote: opt(750, 700, 10), source: 'alt' },
    ],
    0.55,
  )
  assert.equal(ranked.length, 2)
})

test('быстрый и короткий получают свои ярлыки', () => {
  const ranked = rankOptions(
    [
      { quote: opt(700, 900, 90), source: 'main' },
      { quote: opt(720, 600, 60), source: 'alt' },
    ],
    0.55,
  )
  assert.ok(ranked.find((o) => o.miles === 700)!.badges.includes('shortest'))
  assert.ok(ranked.find((o) => o.minutes === 600)!.badges.includes('fastest'))
})

test('пустой список вариантов не роняет ранжирование', () => {
  assert.deepEqual(rankOptions([], 0.55), [])
})

