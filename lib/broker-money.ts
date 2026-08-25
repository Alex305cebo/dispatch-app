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
}

const DAY = 86400000

export function foldMoney(rows: MoneyRow[]): Map<string, BrokerMoney> {
  const acc = new Map<string, BrokerMoney & { miles: number; daysSum: number; daysN: number }>()

  for (const r of rows) {
    // Отменённые в деньги не идут: по ним никто не ехал, не платил и не должен.
    if (r.status === 'cancelled') continue
    const cur =
      acc.get(r.key) ?? { gross: 0, rpm: 0, payDays: null, owed: 0, miles: 0, daysSum: 0, daysN: 0 }
    cur.gross += r.rate
    cur.miles += r.miles
    if (r.invoicedAt && !r.paidAt) cur.owed += r.rate
    if (r.invoicedAt && r.paidAt) {
      const days = (Date.parse(r.paidAt) - Date.parse(r.invoicedAt)) / DAY
      // Отрицательное = оплата раньше счёта (быстрая оплата, дата счёта проставлена
      // задним числом). Считаем нулём, а не выбрасываем: рейс оплачен, и это факт.
      if (Number.isFinite(days)) {
        cur.daysSum += Math.max(0, days)
        cur.daysN += 1
      }
    }
    acc.set(r.key, cur)
  }

  const out = new Map<string, BrokerMoney>()
  for (const [key, a] of acc) {
    out.set(key, {
      gross: a.gross,
      rpm: a.miles > 0 ? a.gross / a.miles : 0,
      payDays: a.daysN > 0 ? Math.round(a.daysSum / a.daysN) : null,
      owed: a.owed,
    })
  }
  return out
}
