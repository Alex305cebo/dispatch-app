import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_FACTORING,
  daysBetween,
  defaultFee,
  financesHref,
  payBadge,
  factoringDoneDay,
  isIsoDay,
  moneyIn,
  payGroup,
  paymentsCsv,
  previousStage,
  todayEt,
  type LoadPayment,
} from './payments.ts'

const pay = (over: Partial<LoadPayment>): LoadPayment => ({
  loadId: 1,
  method: 'factoring',
  factorName: 'OTR Solutions',
  stage: 'submitted',
  submittedOn: '2026-09-14',
  factorRef: null,
  fundedOn: null,
  advanceAmount: null,
  feeAmount: null,
  closedOn: null,
  rejectedOn: null,
  rejectReason: null,
  chargebackOn: null,
  chargebackAmount: null,
  paidVia: null,
  paidOn: null,
  paidAmount: null,
  paidRef: null,
  note: null,
  ...over,
})
const S = DEFAULT_FACTORING
const today = '2026-09-15'

test('без записи оплаты: в работе, отправить в факторинг, старый оплаченный — в готовые', () => {
  assert.equal(payGroup({ status: 'booked' }, null, S, today), 'inWork')
  assert.equal(payGroup({ status: 'in_transit' }, null, S, today), 'inWork')
  assert.equal(payGroup({ status: 'delivered' }, null, S, today), 'toSubmit')
  assert.equal(payGroup({ status: 'paid' }, null, S, today), 'done')
  assert.equal(payGroup({ status: 'cancelled' }, null, S, today), null)
  assert.equal(payGroup({ status: 'quoted' }, null, S, today), null)
})

test('этапы факторинга и регресс: за 30 дней до срока профинансированный уходит в риск', () => {
  assert.equal(payGroup({ status: 'delivered' }, pay({}), S, today), 'awaitingFunding')
  assert.equal(payGroup({ status: 'paid' }, pay({ stage: 'funded', fundedOn: '2026-08-01' }), S, today), 'funded')
  assert.equal(payGroup({ status: 'paid' }, pay({ stage: 'funded', fundedOn: '2026-07-17' }), S, today), 'atRisk')
  assert.equal(payGroup({ status: 'paid' }, pay({ stage: 'funded', fundedOn: '2026-07-17' }), { ...S, recourse: false }, today), 'funded')
  assert.equal(payGroup({ status: 'paid' }, pay({ stage: 'closed' }), S, today), 'done')
  assert.equal(payGroup({ status: 'delivered' }, pay({ stage: 'rejected' }), S, today), 'problems')
  assert.equal(payGroup({ status: 'delivered' }, pay({ stage: 'chargeback' }), S, today), 'problems')
  assert.equal(payGroup({ status: 'paid' }, pay({ method: 'direct', stage: 'paid' }), S, today), 'done')
})

test('комиссия по проценту трака, откат шагов, даты', () => {
  assert.equal(defaultFee(3200, 2), 64)
  assert.equal(defaultFee(1650, 2.5), 41.25)
  assert.equal(defaultFee(1650, 0), 0)
  assert.equal(defaultFee(1650, Number.NaN), 0)
  assert.equal(previousStage(pay({ stage: 'closed' })), 'funded')
  assert.equal(previousStage(pay({ stage: 'chargeback' })), 'funded')
  assert.equal(previousStage(pay({ stage: 'funded' })), 'submitted')
  assert.equal(previousStage(pay({ stage: 'funded', submittedOn: null })), null)
  assert.equal(previousStage(pay({ stage: 'submitted' })), null)
  assert.equal(previousStage(pay({ method: 'direct', stage: 'paid' })), null)
  assert.equal(daysBetween('2026-09-13', '2026-09-15'), 2)
  assert.equal(daysBetween('2026-10-31', '2026-11-02'), 2) // через смену летнего времени
  assert.equal(isIsoDay('2026-09-15'), true)
  assert.equal(isIsoDay('09/15/26'), false)
  assert.equal(moneyIn('funded'), true)
  assert.equal(moneyIn('submitted'), false)
  assert.equal(factoringDoneDay(pay({ stage: 'closed', fundedOn: '2026-08-01', closedOn: '2026-09-10' }), null), '2026-09-10')
  assert.equal(factoringDoneDay(null, '2026-09-15T02:30:00.000Z'), '2026-09-14')
  assert.equal(factoringDoneDay(null, null), null)
})

test('CSV: кавычки и запятые экранируются, пустое — пусто', () => {
  const csv = paymentsCsv([
    { loadId: 1825, referenceId: '38247870', route: 'BILLINGS, MT → West Jefferson, OH', truck: '1935', broker: 'TQL', rate: 3200, status: 'paid', stage: 'funded', payment: pay({ stage: 'funded', fundedOn: '2026-09-15', advanceAmount: 3136, feeAmount: 64, note: 'short "pay"' }) },
  ])
  const [head, line] = csv.split('\r\n')
  assert.match(head!, /^Load ID,Load #,Route/)
  assert.match(line!, /^1825,38247870,"BILLINGS, MT → West Jefferson, OH",1935,TQL,3200,paid,funded,OTR Solutions,2026-09-14,,2026-09-15,3136,64,/)
  assert.match(line!, /"short ""pay"""$/)
})

test('метка оплаты на карточке груза и ссылка в «Документы»', () => {
  assert.equal(payBadge('in_transit', null), null)
  assert.deepEqual(payBadge('delivered', null), { key: 'payments.stage.none', tone: 'plain' })
  assert.deepEqual(payBadge('paid', null), { key: 'payments.stage.paid', tone: 'good' })
  assert.deepEqual(payBadge('delivered', pay({})), { key: 'payments.stage.submitted', tone: 'warn' })
  assert.deepEqual(payBadge('delivered', pay({ stage: 'rejected' })), { key: 'payments.stage.rejected', tone: 'bad' })
  assert.equal(financesHref({ id: 1825, referenceId: '38247870' }), '/docs?q=38247870')
  assert.equal(financesHref({ id: 1825, referenceId: null }), '/docs?q=1825')
})

test('сегодня по восточному времени', () => {
  assert.equal(todayEt(new Date('2026-09-15T02:30:00Z')), '2026-09-14')
  assert.equal(todayEt(new Date('2026-09-15T16:00:00Z')), '2026-09-15')
})
