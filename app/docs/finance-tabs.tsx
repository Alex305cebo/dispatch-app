// Денежные вкладки раздела «Документы»: оплата·факторинг, недели, диспетчеры,
// не оплачено, оплачено (водители — в drivers-tab.tsx, общий вид — в money-ui.tsx).
// Раньше это была вся страница /invoices; после слияния с файлами страница одна
// (app/docs/page.tsx), а эти вкладки — её часть.
// Правила этапов — lib/payments.ts, запись — app/docs/payment-actions.ts.

import Link from 'next/link'
import type { ReactNode } from 'react'
import {
  listLoads,
  listLoadsByDispatcher,
  listPaidLoads,
  listReceivables,
  listTrucks,
  listUninvoicedDelivered,
  type Receivable,
} from '@/lib/loads'
import { sql } from '@/lib/db'
import {
  daysBetween,
  defaultFee,
  factoringDoneDay,
  financesHref,
  isIsoDay,
  payGroup,
  todayEt,
  type PayGroup,
} from '@/lib/payments'
import { factoringSettings, paymentsByLoad } from '@/lib/payments-server'
import { LoadsBoard, type PayRow } from './loads-board'
import type { LoadPaper } from '@/components/load-papers'
import { usd, usd2, loadWeekAnchorMs, weekAnchorOf, weekLabel, weekStart, usDate } from '@/lib/fmt'
import { truckLabel, type LoadRecord, type TruckRecord } from '@/lib/map'
import { t, type Locale } from '@/lib/i18n'
import { getSetting } from '@/lib/settings'
import { RateConButton } from '@/components/ratecon-button'
import { Info } from '@/components/info'
import { CircleCheckBig, Download, Hourglass, Send, TriangleAlert, Wallet } from 'lucide-react'
import { Stat as StageStat } from '@/components/stat'
import { rpmText } from '@/components/rpm'
import { Empty } from '@/components/empty'
import {
  Cell,
  Figure,
  Group,
  LOAD_ROW,
  LoadLine,
  NameCell,
  ROW5,
  RowDetails,
  Summary,
  TableHead,
  WeekChips,
  pickWeeks,
  rpmOf,
  rpmTone,
  weekDay,
} from './money-ui'
/** Закрытые грузы видны столько дней — дальше они в «Оплачено». */
const DONE_DAYS = 45

/** Вкладка «Грузы»: у каждого не отменённого груза — его бумаги и его этап денег. */
/** Вкладка «Грузы» в «Документах» — готовыми плитками, а не одним блоком: четыре
 *  денежных числа сверху были вставками внутри общей карточки, и подвинуть их было
 *  нельзя. Ключи те, которыми их знает раскладка (lib/tiles-core). */
export async function loadsTabTiles({
  companyId,
  locale,
  query,
  stage = '',
  money,
}: {
  companyId: 'default' | 'demo'
  locale: Locale
  query: string
  /** Этап, до которого сразу сужен список (?stage= — ссылка с плитки-числа). */
  stage?: string
  /** Есть право «Финансы» — со суммами и факторингом; иначе только бумаги. */
  money: boolean
}): Promise<{ id: string; node: ReactNode }[]> {
  const today = todayEt()
  const [loads, trucks, payments, settings] = await Promise.all([
    listLoads(companyId),
    listTrucks(companyId),
    paymentsByLoad(companyId),
    factoringSettings(),
  ])
  const byTruckId = new Map<number, TruckRecord>(trucks.map((tr) => [tr.id, tr]))
  // Все бумаги, привязанные к грузу, — не только те три, которых ждёт факторинг:
  // в строке груза видны и пломба, и фото, иначе за ними пришлось бы идти в другой
  // список, ради чего этого раздела и не существовало бы.
  const docs = (await sql`
    SELECT id, load_id, kind FROM documents
    WHERE company_id = ${companyId} AND deleted_at IS NULL AND load_id IS NOT NULL
    ORDER BY id`) as { id: number; load_id: number; kind: string }[]
  const papersOf = new Map<number, LoadPaper[]>()
  for (const d of docs) {
    const list = papersOf.get(d.load_id)
    const paper = { id: d.id, kind: d.kind as LoadPaper['kind'] }
    if (list) list.push(paper)
    else papersOf.set(d.load_id, [paper])
  }

  const rows: PayRow[] = []
  for (const load of loads) {
    const payment = payments.get(load.id) ?? null
    const group = payGroup(load, payment, settings, today)
    if (!group) continue
    if (group === 'done') {
      const day = factoringDoneDay(payment, load.paidAt)
      if (!day || daysBetween(day, today) > DONE_DAYS) continue
    }
    const truck = load.truckId !== null ? byTruckId.get(load.truckId) : undefined
    rows.push({
      id: load.id,
      ref: load.referenceId,
      route: `${load.origin ?? '—'} → ${load.destination ?? '—'}`,
      status: load.status,
      rate: load.rate,
      truck: truck ? truckLabel(truck) : t(locale, 'finances.noTruck'),
      truckId: load.truckId,
      broker: load.brokerName,
      deliveryDate: load.deliveryDate,
      paidAt: load.paidAt,
      group,
      payment,
      papers: papersOf.get(load.id) ?? [],
      invoiceNumber: load.invoiceNumber,
      feeDefault: defaultFee(load.rate, truck?.factoringPercent),
      miles: load.loadedMiles + load.deadheadMiles,
    })
  }

  const sum = (groups: PayGroup[]) => rows.filter((r) => groups.includes(r.group)).reduce((s, r) => s + r.rate, 0)
  // Деньги этого месяца: аванс факторинга или прямая оплата, по дате поступления.
  const month = today.slice(0, 7)
  let inMonth = 0
  let feesMonth = 0
  for (const p of payments.values()) {
    if (p.fundedOn?.startsWith(month)) {
      inMonth += p.advanceAmount ?? 0
      feesMonth += p.feeAmount ?? 0
    }
    if (p.stage === 'paid' && p.paidOn?.startsWith(month)) inMonth += p.paidAmount ?? 0
  }
  const risk = sum(['problems', 'atRisk'])

  const tiles: { id: string; node: ReactNode }[] = []
  if (money) {
    const toSubmit = sum(['toSubmit'])
    const count = (groups: PayGroup[]) =>
      t(locale, 'docs.stage.loads').replace('{n}', String(rows.filter((r) => groups.includes(r.group)).length))
    // Каждое число ведёт к своим грузам: плитка — это и есть фильтр списка ниже.
    tiles.push(
      {
        id: 'pay-to-submit',
        node: (
          <StageStat
            surface="panel"
            label={t(locale, 'payments.stat.toSubmit')}
            value={usd.format(toSubmit)}
            sub={count(['toSubmit'])}
            icon={<Send size={13} strokeWidth={2.5} />}
            accent="warn"
            hero={toSubmit > 0}
            href="/docs?stage=toSubmit#board"
          />
        ),
      },
      {
        id: 'pay-awaiting',
        node: (
          <StageStat
            surface="panel"
            label={t(locale, 'payments.stat.awaiting')}
            value={usd.format(sum(['awaitingFunding']))}
            sub={count(['awaitingFunding'])}
            icon={<Hourglass size={13} strokeWidth={2.5} />}
            href="/docs?stage=awaitingFunding#board"
          />
        ),
      },
      {
        id: 'pay-funded',
        node: (
          <StageStat
            surface="panel"
            label={t(locale, 'payments.stat.fundedMonth')}
            value={usd.format(inMonth)}
            sub={`${t(locale, 'payments.stat.feesMonth')}: ${usd2.format(feesMonth)}`}
            icon={<CircleCheckBig size={13} strokeWidth={2.5} />}
            accent="good"
            tone={inMonth > 0 ? 'good' : undefined}
          />
        ),
      },
      {
        id: 'pay-risk',
        node: (
          <StageStat
            surface="panel"
            label={t(locale, 'payments.stat.risk')}
            value={usd.format(risk)}
            sub={count(['problems', 'atRisk'])}
            icon={<TriangleAlert size={13} strokeWidth={2.5} />}
            accent="bad"
            tone={risk ? 'bad' : undefined}
            href={risk ? `/docs?stage=${rows.some((r) => r.group === 'problems') ? 'problems' : 'atRisk'}#board` : undefined}
          />
        ),
      },
    )
  }
  tiles.push({
    id: 'loads',
    node: (
      <div>
        <LoadsBoard key={stage} rows={rows} settings={settings} today={today} initialQuery={query} initialStage={stage} money={money} />
      </div>
    ),
  })
  return tiles
}

/** Строка груза в «Не оплачено» и «Оплачено»: сколько дней и какой срок. */
type MoneyLine = {
  load: LoadRecord
  /** Цифра второй колонки: дней с выставления счёта (или со сдачи груза) — либо дата оплаты. */
  second: string
  secondSub?: string
  late?: boolean
  /** Груз сдан, а счёт не выставлен: главное действие — собрать инвойс. */
  noInvoice?: boolean
}

type LineGroup = { key: string; title: string; tone: 'plain' | 'good' | 'warn' | 'bad'; rows: MoneyLine[]; extra?: string }

const sumRate = (rows: { load: LoadRecord }[]) => rows.reduce((s, r) => s + r.load.rate, 0)
const milesOf = (load: LoadRecord) => load.loadedMiles + load.deadheadMiles

/** «Не оплачено»: кто и сколько ещё должен. Итог сверху, ниже одна таблица, где грузы
 *  разложены по тому, насколько поздно деньги: сначала то, что надо делать сегодня
 *  (счёт не выставлен, просрочено), потом спокойные корзины по возрасту счёта. */
export async function Unpaid({
  companyId,
  rateCons,
  locale,
}: {
  companyId: 'default' | 'demo'
  rateCons: Map<number, number>
  locale: Locale
}) {
  const today = todayEt()
  const [rec, uninvoiced] = await Promise.all([listReceivables(companyId), listUninvoicedDelivered(companyId)])
  const days = (n: number) => String(n)
  const fromRec = (r: Receivable): MoneyLine => ({
    load: r.load,
    second: days(r.daysOut),
    secondSub: `Net ${r.load.paymentTermsDays}`,
    late: r.overdue,
  })
  const noInvoice: MoneyLine[] = uninvoiced.map((load) => ({
    load,
    second: isIsoDay(load.deliveryDate) ? days(Math.max(0, daysBetween(load.deliveryDate, today))) : '—',
    secondSub: t(locale, 'money.noInvoice'),
    noInvoice: true,
  }))
  const groups: LineGroup[] = [
    { key: 'noInvoice', title: t(locale, 'finances.uninvoiced.heading'), tone: 'warn' as const, rows: noInvoice },
    { key: 'overdue', title: t(locale, 'finances.group.overdue'), tone: 'bad' as const, rows: rec.filter((r) => r.overdue).map(fromRec) },
    ...AGING.map((g) => ({
      key: g.bucket,
      title: t(locale, g.labelKey),
      tone: g.tone,
      rows: rec.filter((r) => !r.overdue && r.bucket === g.bucket).map(fromRec),
    })),
  ].filter((g) => g.rows.length > 0)

  const all = groups.flatMap((g) => g.rows)
  const overdueSum = sumRate(groups.find((g) => g.key === 'overdue')?.rows ?? [])
  const noInvoiceSum = sumRate(noInvoice)

  return (
    <div className="@container flex flex-col gap-3">
      <Summary title={t(locale, 'money.waiting.title')}>
        <Figure label={t(locale, 'finances.stat.waitingTotal')} value={usd.format(sumRate(all))} accent />
        <Figure
          label={t(locale, 'finances.group.overdue')}
          value={usd.format(overdueSum)}
          tone={overdueSum > 0 ? 'text-bad-400' : 'text-t1'}
        />
        <Figure
          label={t(locale, 'money.fig.noInvoice')}
          value={usd.format(noInvoiceSum)}
          tone={noInvoiceSum > 0 ? 'text-warn-400' : 'text-t1'}
        />
        <Figure label={t(locale, 'finances.stat.loadsCount')} value={String(all.length)} />
      </Summary>

      {all.length === 0 ? (
        <Empty icon={CircleCheckBig} title={t(locale, 'finances.unpaid.empty')} />
      ) : (
        <LinesTable
          groups={groups}
          secondLabel={t(locale, 'money.col.days')}
          rateCons={rateCons}
          locale={locale}
          openAll={all.length <= 15}
        />
      )}
    </div>
  )
}

/** Корзины по возрасту счёта — после «Просрочено», по порядку. */
const AGING = [
  { bucket: '0-30' as const, labelKey: 'finances.stat.bucket030' as const, tone: 'plain' as const },
  { bucket: '31-45' as const, labelKey: 'finances.stat.bucket3145' as const, tone: 'warn' as const },
  { bucket: '45+' as const, labelKey: 'finances.stat.bucket45plus' as const, tone: 'bad' as const },
]

/** «Оплачено»: сколько денег пришло. Итог сверху, ниже таблица по месяцам оплаты. */
export async function Paid({
  companyId,
  rateCons,
  locale,
}: {
  companyId: 'default' | 'demo'
  rateCons: Map<number, number>
  locale: Locale
}) {
  const loads = await listPaidLoads(companyId)
  const month = todayEt().slice(0, 7)
  const paidDay = (load: LoadRecord) => (load.paidAt ? todayEt(new Date(load.paidAt)) : null)
  const lines: MoneyLine[] = loads.map((load) => {
    const day = paidDay(load)
    return { load, second: day ? usDate(day) : '—' }
  })
  const gross = sumRate(lines)
  const miles = loads.reduce((s, l) => s + milesOf(l), 0)
  const avg = rpmOf(gross, miles)
  const thisMonth = sumRate(lines.filter((x) => paidDay(x.load)?.startsWith(month)))

  const groups: LineGroup[] = groupByMonth(lines, locale).map((g, i) => ({
    key: g.key,
    title: g.title,
    tone: i === 0 ? ('good' as const) : ('plain' as const),
    rows: g.rows,
    extra: rpmText(g.gross, g.rows.reduce((s, r) => s + milesOf(r.load), 0)) ?? undefined,
  }))

  return (
    <div className="@container flex flex-col gap-3">
      <Summary title={t(locale, 'money.paid.title')}>
        <Figure label={t(locale, 'finances.stat.paidTotal')} value={usd.format(gross)} />
        <Figure
          label={t(locale, 'money.fig.thisMonth')}
          value={usd.format(thisMonth)}
          tone={thisMonth > 0 ? 'text-good-400' : 'text-t1'}
        />
        <Figure label={t(locale, 'finances.stat.avgRpm')} value={avg != null ? usd2.format(avg) : '—'} accent />
        <Figure label={t(locale, 'finances.stat.loadsCount')} value={String(lines.length)} />
      </Summary>

      {lines.length === 0 ? (
        <Empty icon={Wallet} title={t(locale, 'finances.paid.empty')} />
      ) : (
        <LinesTable
          groups={groups}
          secondLabel={t(locale, 'money.col.paidOn')}
          rateCons={rateCons}
          locale={locale}
          openFirst
        />
      )}
    </div>
  )
}

/** Таблица грузов с деньгами: группы строк, в строке — груз, вторая колонка, сумма,
 *  $/mi и кнопки (Rate Con и куда идти дальше). */
function LinesTable({
  groups,
  secondLabel,
  rateCons,
  locale,
  openAll,
  openFirst,
}: {
  groups: LineGroup[]
  secondLabel: string
  rateCons: Map<number, number>
  locale: Locale
  openAll?: boolean
  openFirst?: boolean
}) {
  return (
    <section className="panel overflow-hidden">
      <TableHead
        grid={LOAD_ROW}
        cols={[t(locale, 'money.col.load'), secondLabel, t(locale, 'money.col.amount'), 'Rate per mile', '']}
      />
      {groups.map((g, i) => (
        <Group
          key={g.key}
          title={g.title}
          count={g.rows.length}
          amount={usd.format(sumRate(g.rows))}
          extra={g.extra}
          tone={g.tone}
          // Спокойные корзины длинного списка свёрнуты — открыто то, где надо действовать.
          open={openFirst ? i === 0 : Boolean(openAll) || g.tone !== 'plain'}
        >
          {g.rows.map((row) => (
            <LineRow key={row.load.id} row={row} secondLabel={secondLabel} rc={rateCons.get(row.load.id)} locale={locale} />
          ))}
        </Group>
      ))}
    </section>
  )
}

function LineRow({ row, secondLabel, rc, locale }: { row: MoneyLine; secondLabel: string; rc?: number; locale: Locale }) {
  const { load } = row
  const rate = rpmOf(load.rate, milesOf(load))
  const who = [load.invoiceNumber || (load.referenceId ? `#${load.referenceId}` : null), load.brokerName].filter(Boolean).join(' · ')
  return (
    <li className={`grid grid-cols-3 gap-x-3 gap-y-2 px-4 py-3 @3xl:items-center ${LOAD_ROW}`}>
      <Link href={`/loads/${load.id}`} className="group/ln col-span-3 min-w-0 @3xl:col-span-1">
        <div className="truncate text-md font-medium text-t1 group-hover/ln:underline">
          {load.origin ?? '—'} → {load.destination ?? '—'}
        </div>
        {who && <div className="truncate text-sm text-t3">{who}</div>}
      </Link>
      <Cell
        label={secondLabel}
        value={row.second}
        sub={row.secondSub}
        tone={row.late ? 'text-bad-400' : row.noInvoice ? 'text-warn-400' : 'text-t1'}
      />
      <Cell label={t(locale, 'money.col.amount')} value={usd.format(load.rate)} strong />
      <Cell label="Rate per mile" value={rate != null ? usd2.format(rate) : '—'} />
      <div className="col-span-3 flex items-center gap-2 @3xl:col-span-1 @3xl:justify-end">
        {rc && <RateConButton docId={rc} compact />}
        {row.noInvoice ? (
          <Link
            href={`/loads/${load.id}`}
            className="inline-flex min-h-9 items-center rounded-lg bg-haul-500 px-3 text-sm font-semibold whitespace-nowrap text-white transition-colors hover:bg-haul-400 max-md:min-h-10"
          >
            {t(locale, 'finances.card.buildInvoice')}
          </Link>
        ) : (
          <Link
            href={financesHref(load)}
            className="inline-flex min-h-9 items-center rounded-lg border border-white/12 px-3 text-sm font-medium text-t2 transition-colors hover:border-white/30 hover:text-t1 max-md:min-h-10"
          >
            {t(locale, 'money.pay')}
          </Link>
        )}
      </div>
    </li>
  )
}

/** Строки по месяцу оплаты, свежий месяц первым. Без даты оплаты (старые записи,
 *  отмеченные до того, как дату начали хранить) — своей группой в конце. */
function groupByMonth<T extends { load: { paidAt: string | null; rate: number } }>(rows: T[], locale: Locale) {
  const fmt = new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-US', {
    month: 'long',
    year: 'numeric',
  })
  const groups = new Map<string, { key: string; title: string; rows: T[]; gross: number }>()
  for (const row of rows) {
    // Месяц дня оплаты по восточному времени, как дата в строке, а не в поясе сервера.
    // Середина месяца — тот же месяц в любом поясе.
    const month = row.load.paidAt ? todayEt(new Date(row.load.paidAt)).slice(0, 7) : null
    const key = month ?? 'zzz-unknown'
    const title = month ? fmt.format(new Date(`${month}-15T12:00:00Z`)) : '—'
    if (!groups.has(key)) groups.set(key, { key, title: title.charAt(0).toUpperCase() + title.slice(1), rows: [], gross: 0 })
    const g = groups.get(key)!
    g.rows.push(row)
    g.gross += row.load.rate
  }
  return [...groups.values()].sort((a, b) => b.key.localeCompare(a.key))
}

type Part = { key: string; label: string; loads: number; gross: number; miles: number }
type DispatcherRow = { key: string; name: string; drivers: Map<number, Part>; gross: number; miles: number; loads: number }

/** «По диспетчерам»: неделя каждого диспетчера — как «Водители», только строка —
 *  диспетчер, а раскрывается она его водителями. Диспетчер груза — тот, кто его завёл;
 *  неделя — по дню погрузки (раньше — по дню ввода, и цифры не сходились с «Водителями»). */
export async function ByDispatcher({
  companyId,
  locale,
  week: weekParam,
}: {
  companyId: 'default' | 'demo'
  locale: Locale
  week?: string
}) {
  const [loads, trucks, openAccess] = await Promise.all([
    listLoadsByDispatcher(companyId),
    listTrucks(companyId),
    getSetting('open_access'),
  ])
  const byTruckId = new Map<number, TruckRecord>(trucks.map((tr) => [tr.id, tr]))

  const weeks = new Map<number, Map<string, DispatcherRow>>()
  for (const load of loads) {
    const weekMs = weekAnchorOf(loadWeekAnchorMs(load.pickupDate, load.createdAt))
    let rows = weeks.get(weekMs)
    if (!rows) weeks.set(weekMs, (rows = new Map()))
    const key = load.dispatcherId != null ? String(load.dispatcherId) : 'none'
    let d = rows.get(key)
    if (!d) {
      d = { key, name: load.dispatcherName ?? t(locale, 'finances.dispatcher.none'), drivers: new Map(), gross: 0, miles: 0, loads: 0 }
      rows.set(key, d)
    }
    const truck = load.truckId !== null ? byTruckId.get(load.truckId) : undefined
    const tKey = truck?.id ?? 0
    let part = d.drivers.get(tKey)
    if (!part) {
      part = { key: String(tKey), label: truck ? truckLabel(truck) : t(locale, 'finances.noTruck'), loads: 0, gross: 0, miles: 0 }
      d.drivers.set(tKey, part)
    }
    const miles = milesOf(load)
    part.loads += 1
    part.gross += load.rate
    part.miles += miles
    d.loads += 1
    d.gross += load.rate
    d.miles += miles
  }

  const current = weekStart()
  const { list: weekList, chosen } = pickWeeks(weeks.keys(), current, weekParam)
  const rows = [...(weeks.get(chosen)?.values() ?? [])].sort((a, b) => b.gross - a.gross)
  const total = rows.reduce(
    (s, r) => ({ gross: s.gross + r.gross, miles: s.miles + r.miles, loads: s.loads + r.loads }),
    { gross: 0, miles: 0, loads: 0 },
  )
  const fleetRpm = rpmOf(total.gross, total.miles)

  // Open access пускает без входа — пока он включён, у новых грузов нет диспетчера,
  // и отчёт молча пустел бы без объяснения.
  const openAccessWarning = openAccess === '1' && (
    <p className="rounded-lg border border-warn-400/25 bg-warn-400/[0.06] px-3 py-2 text-sm leading-relaxed text-warn-300">
      {t(locale, 'finances.openAccessWarning')}
    </p>
  )

  return (
    <div className="@container flex flex-col gap-3">
      {openAccessWarning}
      <WeekChips
        tab="dispatchers"
        weeks={weekList}
        chosen={chosen}
        current={current}
        currentLabel={t(locale, 'drivers.week.current')}
        locale={locale}
      />
      <Summary
        title={<span className="capitalize">{weekLabel(chosen, locale)}</span>}
        note={
          <>
            {t(locale, 'finances.payWeekNote')}
            <Info text={t(locale, 'money.dispatchers.info')} />
          </>
        }
      >
        <Figure label={t(locale, 'drivers.col.gross')} value={usd.format(total.gross)} />
        <Figure label={t(locale, 'drivers.col.miles')} value={Math.round(total.miles).toLocaleString('en-US')} />
        <Figure label={t(locale, 'drivers.fleetRpm')} value={fleetRpm != null ? usd2.format(fleetRpm) : '—'} accent />
        <Figure label={t(locale, 'drivers.col.loads')} value={String(total.loads)} />
      </Summary>

      {rows.length === 0 ? (
        <p className="panel p-6 text-center text-base text-t3">{t(locale, 'drivers.empty')}</p>
      ) : (
        <section className="panel overflow-hidden">
          <TableHead
            grid={ROW5}
            cols={[
              t(locale, 'money.col.dispatcher'),
              t(locale, 'drivers.col.loads'),
              t(locale, 'drivers.col.gross'),
              t(locale, 'drivers.col.miles'),
              'Rate per mile',
            ]}
          />
          <ul className="divide-y divide-white/6">
            {rows.map((d) => {
              const rate = rpmOf(d.gross, d.miles)
              return (
                <li key={d.key}>
                  <RowDetails
                    grid={ROW5}
                    head={
                      <>
                        <NameCell
                          title={d.name}
                          under={
                            <div className="text-xs text-t3">
                              {t(locale, 'money.drivers').replace('{n}', String(d.drivers.size))}
                            </div>
                          }
                        />
                        <Cell label={t(locale, 'drivers.col.loads')} value={String(d.loads)} className="@max-3xl:order-4" />
                        <Cell label={t(locale, 'drivers.col.gross')} value={usd.format(d.gross)} strong className="@max-3xl:order-1" />
                        <Cell
                          label={t(locale, 'drivers.col.miles')}
                          value={Math.round(d.miles).toLocaleString('en-US')}
                          className="@max-3xl:order-3"
                        />
                        <Cell
                          label="Rate per mile"
                          value={rate != null ? usd2.format(rate) : '—'}
                          big
                          tone={rpmTone(rate, fleetRpm)}
                          className="@max-3xl:order-2"
                        />
                      </>
                    }
                  >
                    <PartLines parts={[...d.drivers.values()]} week={chosen} locale={locale} />
                  </RowDetails>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}

/** Раскрытая строка недели или диспетчера: по строке на водителя — со ссылкой на его
 *  неделю в «Водителях», где видны уже сами грузы. */
function PartLines({ parts, week, locale }: { parts: Part[]; week: number; locale: Locale }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {parts
        .sort((a, b) => b.gross - a.gross)
        .map((p) => (
          <li key={p.key}>
            <LoadLine
              href={`/docs?tab=drivers&week=${weekDay(week)}`}
              route={p.label}
              meta={` · ${t(locale, 'finances.loadsCountSuffix').replace('{n}', String(p.loads))}`}
              miles={p.miles}
              amount={usd.format(p.gross)}
              rpm={rpmOf(p.gross, p.miles)}
            />
          </li>
        ))}
    </ul>
  )
}

type GrossWeek = { ms: number; trucks: Map<number, Part>; gross: number; miles: number; loads: number }

/** Недель в итоге «В среднем» и «RPM за N нед.». */
const AVG_WEEKS = 8

/** «Недели»: сколько парк привёз за каждую неделю — гросс, мили, RPM. Итог сверху
 *  сравнивает эту неделю с прошлой и со средней; строка недели раскрывается тракaми. */
export async function ByWeek({ companyId, locale }: { companyId: 'default' | 'demo'; locale: Locale }) {
  const [loads, trucks] = await Promise.all([listLoads(companyId), listTrucks(companyId)])
  const byTruckId = new Map<number, TruckRecord>(trucks.map((tr) => [tr.id, tr]))
  const committed = loads.filter((l) => l.status !== 'quoted' && l.status !== 'cancelled')

  const weeks = new Map<number, GrossWeek>()
  for (const load of committed) {
    // Пикап — день, а не момент: new Date('yyyy-mm-dd') — полночь UTC, по восточному это ещё вчера.
    const ms = weekAnchorOf(loadWeekAnchorMs(load.pickupDate, load.createdAt))
    let week = weeks.get(ms)
    if (!week) weeks.set(ms, (week = { ms, trucks: new Map(), gross: 0, miles: 0, loads: 0 }))
    const truck = load.truckId !== null ? byTruckId.get(load.truckId) : undefined
    const key = truck?.id ?? 0
    let part = week.trucks.get(key)
    if (!part) {
      part = { key: String(key), label: truck ? truckLabel(truck) : t(locale, 'finances.noTruck'), loads: 0, gross: 0, miles: 0 }
      week.trucks.set(key, part)
    }
    const miles = milesOf(load)
    part.loads += 1
    part.gross += load.rate
    part.miles += miles
    week.gross += load.rate
    week.miles += miles
    week.loads += 1
  }

  const sorted = [...weeks.values()].sort((a, b) => b.ms - a.ms)
  if (sorted.length === 0) {
    return <p className="panel p-6 text-base text-t2">{t(locale, 'finances.noLoads')}</p>
  }

  const current = weekStart()
  // Прошлая пятница — через середину прошлой недели: в неделе перевода часов 7×24 ч
  // от полуночи пятницы — это не полночь пятницы.
  const previous = weekAnchorOf(current - 3 * 86_400_000)
  const thisW = weeks.get(current)
  const lastW = weeks.get(previous)
  const recent = sorted.filter((w) => w.ms <= current).slice(0, AVG_WEEKS)
  const recentGross = recent.reduce((s, w) => s + w.gross, 0)
  const recentMiles = recent.reduce((s, w) => s + w.miles, 0)
  const avgRpm = rpmOf(recentGross, recentMiles)
  const maxGross = Math.max(1, ...sorted.map((w) => w.gross))

  return (
    <div className="@container flex flex-col gap-3">
      <Summary
        title={t(locale, 'money.weeks.title')}
        note={
          <>
            {t(locale, 'finances.payWeekNote')}
            <Info text={t(locale, 'drivers.rpmInfo')} />
          </>
        }
      >
        <Figure
          label={t(locale, 'drivers.week.current')}
          value={usd.format(thisW?.gross ?? 0)}
          sub={thisW ? (rpmText(thisW.gross, thisW.miles) ?? undefined) : undefined}
        />
        <Figure
          label={t(locale, 'money.fig.lastWeek')}
          value={usd.format(lastW?.gross ?? 0)}
          sub={lastW ? (rpmText(lastW.gross, lastW.miles) ?? undefined) : undefined}
        />
        <Figure label={t(locale, 'money.fig.avgWeek')} value={usd.format(recent.length ? recentGross / recent.length : 0)} />
        <Figure
          label={t(locale, 'money.fig.rpmWeeks').replace('{n}', String(recent.length))}
          value={avgRpm != null ? usd2.format(avgRpm) : '—'}
          accent
        />
      </Summary>

      <section className="panel overflow-hidden">
        <TableHead
          grid={ROW5}
          cols={[
            t(locale, 'money.col.week'),
            t(locale, 'drivers.col.loads'),
            t(locale, 'drivers.col.gross'),
            t(locale, 'drivers.col.miles'),
            'Rate per mile',
          ]}
        />
        <ul className="divide-y divide-white/6">
          {sorted.map((w) => {
              const rate = rpmOf(w.gross, w.miles)
              return (
                <li key={w.ms}>
                  <RowDetails
                    grid={ROW5}
                    open={w.ms === current}
                    head={
                      <>
                        <NameCell
                          title={<span className="capitalize">{weekLabel(w.ms, locale)}</span>}
                          // Длина полоски — гросс недели против самой сильной: видно, какая неделя провалилась.
                          under={
                            <div className="mt-1.5 flex items-center gap-2">
                              <div className="h-1.5 w-full max-w-48 overflow-hidden rounded-full bg-white/8">
                                <div
                                  className={`h-full rounded-full ${w.ms === current ? 'bg-haul-400' : 'bg-white/35'}`}
                                  style={{ width: `${Math.max(3, (w.gross / maxGross) * 100)}%` }}
                                />
                              </div>
                              {w.ms === current && (
                                <span className="shrink-0 text-xs font-medium text-haul-300">{t(locale, 'drivers.week.current')}</span>
                              )}
                            </div>
                          }
                        />
                        <Cell label={t(locale, 'drivers.col.loads')} value={String(w.loads)} className="@max-3xl:order-4" />
                        <Cell label={t(locale, 'drivers.col.gross')} value={usd.format(w.gross)} strong className="@max-3xl:order-1" />
                        <Cell
                          label={t(locale, 'drivers.col.miles')}
                          value={Math.round(w.miles).toLocaleString('en-US')}
                          className="@max-3xl:order-3"
                        />
                        <Cell
                          label="Rate per mile"
                          value={rate != null ? usd2.format(rate) : '—'}
                          big
                          tone={rpmTone(rate, avgRpm)}
                          className="@max-3xl:order-2"
                        />
                      </>
                    }
                  >
                    <PartLines parts={[...w.trucks.values()]} week={w.ms} locale={locale} />
                    <div className="mt-1.5 flex flex-wrap gap-2 px-2 pb-1">
                      <Link
                        href={`/docs?tab=drivers&week=${weekDay(w.ms)}`}
                        className="inline-flex min-h-9 items-center rounded-lg border border-white/12 px-3 text-sm font-medium text-t2 transition-colors hover:border-white/30 hover:text-t1"
                      >
                        {t(locale, 'money.weeks.open')} →
                      </Link>
                      <a
                        href={`/api/export/week?start=${w.ms}`}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/12 px-3 text-sm font-medium text-t2 transition-colors hover:border-white/30 hover:text-t1"
                      >
                        <Download size={14} strokeWidth={2.5} />
                        {t(locale, 'drivers.csv')}
                      </a>
                    </div>
                  </RowDetails>
                </li>
              )
            })}
        </ul>
      </section>
    </div>
  )
}
