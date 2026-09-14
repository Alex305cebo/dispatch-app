// Учёт денег за груз: путь через факторинг (OTR Solutions) и редкая прямая оплата.
//
// До этого у груза было одно «оплачен / не оплачен», и нажимал его кто угодно на полосе
// статусов. Но у нас почти все грузы идут через факторинг, и между «доставлен» и
// «деньги на счету» есть шаги, за которыми смотрит бухгалтер:
//
//   отправлен в OTR → профинансирован (аванс минус комиссия) → закрыт (брокер заплатил OTR)
//   исключения: OTR отказал; регресс (брокер не заплатил, OTR вернул счёт)
//
// Модуль чистый: этапы, группы для страницы «Финансы», значения по умолчанию, CSV.
// Запись — app/invoices/payment-actions.ts, чтение — lib/payments-server.ts.
//
// Как это ложится на прежние поля груза: деньги пришли (профинансирован или оплачен
// напрямую) — груз «Оплачен» с датой получения, как и раньше; отчёты «Оплачено» и «По
// неделям» считают по loads.paid_at и ничего не заметили. Отправка в OTR и есть счёт —
// ставит invoiced_at, если счёта ещё не было, чтобы работал отсчёт дней ожидания.

import type { LoadStatus } from './map.ts'

export type PayStage = 'submitted' | 'funded' | 'closed' | 'rejected' | 'chargeback' | 'paid'
export type PayVia = 'ach' | 'check' | 'quickpay' | 'other'
export const PAY_VIA: PayVia[] = ['ach', 'check', 'quickpay', 'other']

export type LoadPayment = {
  loadId: number
  method: 'factoring' | 'direct'
  factorName: string | null
  stage: PayStage
  /** yyyy-mm-dd */
  submittedOn: string | null
  factorRef: string | null
  fundedOn: string | null
  advanceAmount: number | null
  feeAmount: number | null
  closedOn: string | null
  rejectedOn: string | null
  rejectReason: string | null
  chargebackOn: string | null
  chargebackAmount: number | null
  paidVia: PayVia | null
  paidOn: string | null
  paidAmount: number | null
  paidRef: string | null
  note: string | null
}

export type FactoringSettings = {
  /** Название факторинга в интерфейсе и CSV. */
  name: string
  /** Договор с регрессом: брокер не заплатил за recourseDays — OTR возвращает счёт. */
  recourse: boolean
  recourseDays: number
}

export const DEFAULT_FACTORING: FactoringSettings = { name: 'OTR Solutions', recourse: true, recourseDays: 90 }

/** За сколько дней до регресса груз уходит в «риск». */
export const RISK_WARN_DAYS = 30
/** Отправлен в факторинг, а денег всё нет дольше этого — подсветить. */
export const FUNDING_SLOW_DAYS = 2

export type PayGroup = 'inWork' | 'toSubmit' | 'awaitingFunding' | 'atRisk' | 'funded' | 'problems' | 'done'

/** Порядок групп на странице — в порядке работы бухгалтера. */
export const PAY_GROUPS: PayGroup[] = ['problems', 'toSubmit', 'awaitingFunding', 'atRisk', 'funded', 'inWork', 'done']

const DAY = 86_400_000
const at = (d: string) => Date.parse(`${d}T12:00:00Z`)

/** Целые дни между двумя датами yyyy-mm-dd (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((at(b) - at(a)) / DAY)
}

export const isIsoDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(at(v))

/** В какую группу «Финансов» попадает груз; null — не про деньги (заявка, отменён). */
export function payGroup(
  load: { status: LoadStatus },
  p: LoadPayment | null,
  s: FactoringSettings,
  today: string,
): PayGroup | null {
  if (load.status === 'cancelled' || load.status === 'quoted') return null
  if (!p) {
    if (load.status === 'booked' || load.status === 'in_transit') return 'inWork'
    if (load.status === 'delivered') return 'toSubmit'
    return 'done' // оплачен до учёта факторинга
  }
  switch (p.stage) {
    case 'submitted':
      return 'awaitingFunding'
    case 'funded':
      return s.recourse && p.fundedOn && daysBetween(p.fundedOn, today) >= s.recourseDays - RISK_WARN_DAYS ? 'atRisk' : 'funded'
    case 'rejected':
    case 'chargeback':
      return 'problems'
    default:
      return 'done'
  }
}

/** День, когда груз закрылся по деньгам: брокер оплатил факторинг, прямая оплата
 * или (для отмеченных до учёта) paid_at. null — даты нет. */
export function factoringDoneDay(p: LoadPayment | null, paidAt: string | null): string | null {
  if (p) return p.closedOn ?? p.paidOn ?? p.fundedOn
  return paidAt ? todayEt(new Date(paidAt)) : null
}

/** Груз на вкладке «Оплата · факторинг» — через поиск по номеру груза. */
export const financesHref = (load: { id: number; referenceId?: string | null }) =>
  `/invoices?q=${encodeURIComponent(load.referenceId || String(load.id))}`

/** Метка «где деньги» для карточки груза: ключ словаря и цвет. */
export function payBadge(
  status: LoadStatus,
  p: LoadPayment | null,
): { key: `payments.stage.${PayStage | 'none'}`; tone: 'good' | 'warn' | 'bad' | 'plain' } | null {
  if (status !== 'delivered' && status !== 'paid') return null
  if (!p) return status === 'paid' ? { key: 'payments.stage.paid', tone: 'good' } : { key: 'payments.stage.none', tone: 'plain' }
  const tone = p.stage === 'rejected' || p.stage === 'chargeback' ? 'bad' : p.stage === 'submitted' ? 'warn' : 'good'
  return { key: `payments.stage.${p.stage}`, tone }
}

/** Комиссия факторинга по проценту из экономики трака, до цента. */
export function defaultFee(rate: number, factoringPercent: number | null | undefined): number {
  const pct = Number.isFinite(factoringPercent) && (factoringPercent ?? 0) > 0 ? factoringPercent! : 0
  return Math.round(rate * pct) / 100
}

/** На какой этап откатывает «отменить последний шаг»; null — запись оплаты удаляется. */
export function previousStage(p: LoadPayment): PayStage | null {
  switch (p.stage) {
    case 'closed':
    case 'chargeback':
      return 'funded'
    case 'funded':
    case 'rejected':
      return p.method === 'factoring' && p.submittedOn ? 'submitted' : null
    default:
      return null
  }
}

/** Деньги у нас: груз «Оплачен». */
export const moneyIn = (stage: PayStage | null | undefined) => stage === 'funded' || stage === 'closed' || stage === 'paid'

export type PayCsvRow = {
  loadId: number
  referenceId: string | null
  route: string
  truck: string
  broker: string | null
  rate: number
  status: string
  stage: string
  payment: LoadPayment | null
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** CSV для бухгалтера: одна строка на груз, суммы числами, даты yyyy-mm-dd. */
export function paymentsCsv(rows: PayCsvRow[]): string {
  const head = [
    'Load ID', 'Load #', 'Route', 'Truck', 'Broker', 'Rate', 'Load status', 'Payment stage',
    'Factor', 'Submitted', 'Factor ref', 'Funded', 'Advance', 'Fee', 'Closed',
    'Rejected', 'Reject reason', 'Chargeback', 'Chargeback amount',
    'Paid direct via', 'Paid on', 'Paid amount', 'Paid ref', 'Note',
  ]
  const lines = rows.map((r) => {
    const p = r.payment
    return [
      r.loadId, r.referenceId, r.route, r.truck, r.broker, r.rate, r.status, r.stage,
      p?.factorName, p?.submittedOn, p?.factorRef, p?.fundedOn, p?.advanceAmount, p?.feeAmount, p?.closedOn,
      p?.rejectedOn, p?.rejectReason, p?.chargebackOn, p?.chargebackAmount,
      p?.paidVia, p?.paidOn, p?.paidAmount, p?.paidRef, p?.note,
    ].map(csvCell).join(',')
  })
  return [head.join(','), ...lines].join('\r\n')
}

/** Сегодня по восточному времени, yyyy-mm-dd — дата по умолчанию в формах оплаты. */
export function todayEt(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}
