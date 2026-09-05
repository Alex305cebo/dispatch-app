// Что брокер значит в деньгах: сколько привёз, по какой ставке за милю, за сколько
// дней реально платит и сколько должен прямо сейчас.
//
// Дни оплаты — единственное число, которого нет ни в одном справочнике. В рейт-коне
// написано «30 дней», в FMCSA этого нет вообще, а платит брокер так, как платит; это
// видно только по своей истории счетов.
//
// Отдельный модуль от lib/brokers.ts по той же причине, что и broker-key.ts: тот
// файл поднимает подключение к базе на импорте, а тест не может загрузить модуль,
// которому нужен DATABASE_URL.

export type MoneyRow = {
  /** Ключ брокера — тот же, по которому строки группируются в списке. */
  key: string
  rate: number
  /** Все мили рейса: гружёные плюс порожние. */
  miles: number
  status: string
  invoicedAt: string | null
  paidAt: string | null
}

export type BrokerMoney = {
  gross: number
  /** Весь гросс ÷ все мили. Не среднее от средних — иначе один короткий дорогой
   * рейс задирал бы всю строку. */
  rpm: number
  /** Среднее число дней от счёта до денег по оплаченным рейсам; null — ещё ни один
   * не оплачен, и придумывать тут нечего. */
  payDays: number | null
  /** Выставлено и не оплачено — то, что он должен сейчас. */
  owed: number
  /** Сколько счетов оплачено — на скольких рейсах основан payDays. */
  paidCount: number
  /** Сколько раз платил дольше 45 дней, плюс неоплаченные, висящие дольше 45. */
  lateCount: number
  /** Оценка плательщика: good ≤30 дн. без просрочек, ok ≤45, slow — дольше или с
   * просрочками, null — истории оплат нет. По ней предупреждаем на новом грузе. */
  payGrade: 'good' | 'ok' | 'slow' | null
}

export const LATE_DAYS = 45

export function payGradeOf(payDays: number | null, lateCount: number): BrokerMoney['payGrade'] {
  if (payDays === null && lateCount === 0) return null
  if (lateCount > 0 || (payDays ?? 0) > LATE_DAYS) return 'slow'
  return (payDays ?? 0) <= 30 ? 'good' : 'ok'
}

const DAY = 86400000

export function foldMoney(rows: MoneyRow[]): Map<string, BrokerMoney> {
  const acc = new Map<string, BrokerMoney & { miles: number; daysSum: number; daysN: number }>()
  const now = Date.now()

  for (const r of rows) {
    // Отменённые в деньги не идут: по ним никто не ехал, не платил и не должен.
    if (r.status === 'cancelled') continue
    const cur =
      acc.get(r.key) ?? {
        gross: 0, rpm: 0, payDays: null, owed: 0, paidCount: 0, lateCount: 0, payGrade: null, miles: 0, daysSum: 0, daysN: 0,
      }
    cur.gross += r.rate
    cur.miles += r.miles
    if (r.invoicedAt && !r.paidAt) {
      cur.owed += r.rate
      // Висит дольше 45 дней — уже просрочка, даже если ещё заплатит.
      if ((now - Date.parse(r.invoicedAt)) / DAY > LATE_DAYS) cur.lateCount += 1
    }
    if (r.invoicedAt && r.paidAt) {
      const days = (Date.parse(r.paidAt) - Date.parse(r.invoicedAt)) / DAY
      // Отрицательное = оплата раньше счёта (быстрая оплата, дата счёта проставлена
      // задним числом). Считаем нулём, а не выбрасываем: рейс оплачен, и это факт.
      if (Number.isFinite(days)) {
        cur.daysSum += Math.max(0, days)
        cur.daysN += 1
        if (days > LATE_DAYS) cur.lateCount += 1
      }
    }
    acc.set(r.key, cur)
  }

  const out = new Map<string, BrokerMoney>()
  for (const [key, a] of acc) {
    const payDays = a.daysN > 0 ? Math.round(a.daysSum / a.daysN) : null
    out.set(key, {
      gross: a.gross,
      rpm: a.miles > 0 ? a.gross / a.miles : 0,
      payDays,
      owed: a.owed,
      paidCount: a.daysN,
      lateCount: a.lateCount,
      payGrade: payGradeOf(payDays, a.lateCount),
    })
  }
  return out
}
