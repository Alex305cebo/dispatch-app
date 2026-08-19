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
