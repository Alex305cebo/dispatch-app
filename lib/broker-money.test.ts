import { test } from 'node:test'
import assert from 'node:assert/strict'
import { foldMoney, type MoneyRow } from './broker-money.ts'

const row = (p: Partial<MoneyRow>): MoneyRow => ({
  key: 'mc1',
  rate: 2000,
  miles: 1000,
  status: 'delivered',
  invoicedAt: null,
  paidAt: null,
  ...p,
})

test('ставка за милю — весь гросс на все мили, а не среднее средних', () => {
  const m = foldMoney([
    row({ rate: 1000, miles: 200 }),
    row({ rate: 3000, miles: 1600 }),
  ]).get('mc1')!
  assert.equal(m.gross, 4000)
  assert.equal(m.rpm.toFixed(3), (4000 / 1800).toFixed(3))
})

test('отменённый рейс не считается ни в гросс, ни в долг', () => {
  const m = foldMoney([
    row({ status: 'cancelled', rate: 5000, invoicedAt: '2026-08-01' }),
    row({ rate: 2000 }),
  ]).get('mc1')!
  assert.equal(m.gross, 2000)
  assert.equal(m.owed, 0)
})

test('должен только то, что выставлено и не оплачено', () => {
  const m = foldMoney([
    row({ rate: 1500, invoicedAt: '2026-08-01', paidAt: null }),
    row({ rate: 2500, invoicedAt: '2026-07-01', paidAt: '2026-07-20' }),
    row({ rate: 900, invoicedAt: null }), // ещё не выставлен — не долг
  ]).get('mc1')!
  assert.equal(m.owed, 1500)
})

test('дни оплаты — среднее по фактически оплаченным', () => {
  const m = foldMoney([
    row({ invoicedAt: '2026-07-01', paidAt: '2026-07-21' }), // 20
    row({ invoicedAt: '2026-08-01', paidAt: '2026-08-31' }), // 30
    row({ invoicedAt: '2026-08-10', paidAt: null }), // не участвует
  ]).get('mc1')!
  assert.equal(m.payDays, 25)
})

test('без оплаченных рейсов дни не выдумываются', () => {
  const m = foldMoney([row({ invoicedAt: '2026-08-01' })]).get('mc1')!
  assert.equal(m.payDays, null)
})

test('оплата раньше счёта считается нулём дней, а не минусом', () => {
  const m = foldMoney([row({ invoicedAt: '2026-08-10', paidAt: '2026-08-05' })]).get('mc1')!
  assert.equal(m.payDays, 0)
})

test('нулевой пробег не даёт деления на ноль', () => {
  const m = foldMoney([row({ miles: 0, rate: 900 })]).get('mc1')!
  assert.equal(m.rpm, 0)
})

test('брокеры не смешиваются между собой', () => {
  const out = foldMoney([row({ key: 'a', rate: 100 }), row({ key: 'b', rate: 700 })])
  assert.equal(out.get('a')!.gross, 100)
  assert.equal(out.get('b')!.gross, 700)
})
