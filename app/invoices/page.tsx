import Link from 'next/link'
import { listPaidLoads, listReceivables, listUninvoicedDelivered, rateConByLoad, truckForLoad } from '@/lib/loads'
import { getCompany } from '@/lib/invoice'
import { calcLoad, type Breakdown } from '@/lib/profit'
import { usd } from '@/lib/fmt'
import { CompanyForm, PaidToggle } from '@/components/invoice-actions'
import { RateConButton } from '@/components/ratecon-button'
import { Info } from '@/components/info'

export const dynamic = 'force-dynamic'

export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const tab = (await searchParams).tab === 'paid' ? 'paid' : 'unpaid'
  const [company, rateCons] = await Promise.all([getCompany(), rateConByLoad()])

  return (
    <main className="mx-auto max-w-4xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <header className="mb-5">
        <h1 className="flex items-center gap-2 text-[17px] font-semibold">
          Оплаты (AR)
          <Info side="bottom" text="Не оплачено — выставленные, но ещё не оплаченные счета, по возрасту долга. Оплачено — уже пришедшие деньги, с разбивкой прибыли по каждому грузу. Инвойс собирается на странице груза после загрузки POD." />
        </h1>
        <p className="text-[13px] text-white/65">
          {tab === 'unpaid'
            ? 'Кто ещё не заплатил. Инвойс собирается на странице груза после загрузки POD.'
            : 'Уже оплаченные грузы и что каждый из них принёс.'}
        </p>
      </header>

      <div className="mb-5 flex gap-1.5 border-b border-white/8">
        <Tab href="/invoices" active={tab === 'unpaid'}>
          Не оплачено
        </Tab>
        <Tab href="/invoices?tab=paid" active={tab === 'paid'}>
          Оплачено
        </Tab>
      </div>

      {tab === 'unpaid' ? (
        <Unpaid rateCons={rateCons} />
      ) : (
        <Paid rateCons={rateCons} />
      )}

      <details className="panel mt-6 p-4" open={!company.name}>
        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-white/62">
          Данные компании для инвойса {company.name ? `· ${company.name}` : '· не заполнено'}
          <span className="ml-1.5 inline-block align-middle">
            <Info text="Реквизиты твоей компании, которые печатаются в счёте брокеру. MC/DOT — номер твоей перевозочной авторизации из бумаг FMCSA (тот же, что в договоре с брокером); по нему брокер понимает, кому платит. Remit-to — если работаешь с факторингом, туда пишется их адрес получения платежа (Notice of Assignment). Заполняется один раз." />
          </span>
        </summary>
        <div className="mt-4">
          <CompanyForm initial={company} />
        </div>
      </details>
    </main>
  )
}

function Tab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-medium transition-colors ${
        active ? 'border-haul-500 text-white' : 'border-transparent text-white/55 hover:text-white/85'
      }`}
    >
      {children}
    </Link>
  )
}

async function Unpaid({ rateCons }: { rateCons: Map<number, number> }) {
  const [rec, uninvoiced] = await Promise.all([listReceivables(), listUninvoicedDelivered()])
  const total = rec.reduce((s, r) => s + r.load.rate, 0)
  const uninvoicedTotal = uninvoiced.reduce((s, l) => s + l.rate, 0)
  const overdue = rec.filter((r) => r.overdue)
  const buckets = {
    '0-30': rec.filter((r) => r.bucket === '0-30'),
    '31-45': rec.filter((r) => r.bucket === '31-45'),
    '45+': rec.filter((r) => r.bucket === '45+'),
  }

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Ждём всего"
          value={usd.format(total + uninvoicedTotal)}
          info={uninvoicedTotal > 0 ? `Включая ${usd.format(uninvoicedTotal)} без выставленного счёта` : undefined}
        />
        <Stat label="0–30 дн." value={usd.format(buckets['0-30'].reduce((s, r) => s + r.load.rate, 0))} />
        <Stat
          label="31–45 дн."
          value={usd.format(buckets['31-45'].reduce((s, r) => s + r.load.rate, 0))}
          tone={buckets['31-45'].length ? 'warn' : undefined}
        />
        <Stat
          label="45+ / просрочка"
          value={usd.format(buckets['45+'].reduce((s, r) => s + r.load.rate, 0))}
          tone={buckets['45+'].length || overdue.length ? 'bad' : undefined}
        />
      </div>

      {/* Delivered but never invoiced — these used to just vanish: not in this list
          (no invoiced_at yet), not visible anywhere else either. */}
      {uninvoiced.length > 0 && (
        <div className="mb-5">
          <h2 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
            Доставлено, счёт не выставлен · {usd.format(uninvoicedTotal)}
            <Info text="Груз довезли, но инвойс ещё не собран (это делается на странице груза) — эти деньги не попадают в возрастные корзины выше, пока инвойс не выставлен." />
          </h2>
          <div className="flex flex-col gap-2">
            {uninvoiced.map((load) => (
              <div key={load.id} className="panel flex items-center gap-4 p-4 border-warn-400/20">
                <Link href={`/loads/${load.id}`} className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-medium">
                    {load.origin ?? '—'} → {load.destination ?? '—'}
                  </div>
                  <div className="mt-0.5 text-[12px] text-white/60">
                    {load.brokerMc ? `MC ${load.brokerMc} · ` : ''}собери инвойс на странице груза
                  </div>
                </Link>
                <span className="nums shrink-0 text-[15px] font-bold">{usd.format(load.rate)}</span>
                {rateCons.get(load.id) && <RateConButton docId={rateCons.get(load.id)!} compact />}
              </div>
            ))}
          </div>
        </div>
      )}

      {rec.length === 0 ? (
        uninvoiced.length === 0 && (
          <p className="panel p-6 text-[13px] text-white/60">
            Нет неоплаченных инвойсов. Собери инвойс на странице доставленного груза.
          </p>
        )
      ) : (
        <div className="flex flex-col gap-2">
          {rec.map((r) => (
            <div
              key={r.load.id}
              className={`panel flex items-center gap-4 p-4 ${r.overdue ? 'border-bad-500/30' : ''}`}
            >
              <Link href={`/loads/${r.load.id}`} className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-medium">
                  {r.load.invoiceNumber} · {r.load.origin ?? '—'} → {r.load.destination ?? '—'}
                </div>
                <div className="mt-0.5 text-[12px] text-white/60">
                  {r.load.brokerMc ? `MC ${r.load.brokerMc} · ` : ''}
                  <span className={r.overdue ? 'text-bad-400' : 'text-white/60'}>
                    {r.daysOut} дн. (Net {r.load.paymentTermsDays})
                    {r.overdue ? ' — просрочка' : ''}
                  </span>
                </div>
              </Link>
              <span className="nums shrink-0 text-[15px] font-bold">{usd.format(r.load.rate)}</span>
              {rateCons.get(r.load.id) && <RateConButton docId={rateCons.get(r.load.id)!} compact />}
              <PaidToggle loadId={r.load.id} />
            </div>
          ))}
        </div>
      )}
    </>
  )
}

async function Paid({ rateCons }: { rateCons: Map<number, number> }) {
  const loads = await listPaidLoads()
  const trucks = await Promise.all(loads.map((l) => truckForLoad(l)))
  // Old/incomplete loads can be missing miles or transit days — calcLoad throws on
  // those rather than guess, so a paid row without clean economics just shows the
  // rate with no breakdown instead of taking the whole tab down.
  const rows = loads.map((load, i) => {
    let r: Breakdown | null = null
    try {
      r = calcLoad(load, trucks[i])
    } catch {
      r = null
    }
    return { load, r }
  })

  const totalGross = rows.reduce((s, x) => s + x.load.rate, 0)
  const totalNet = rows.reduce((s, x) => s + (x.r?.net ?? 0), 0)
  const totalMiles = rows.reduce((s, x) => s + (x.r?.totalMiles ?? 0), 0)
  const avgRpm = totalMiles > 0 ? rows.reduce((s, x) => s + (x.r ? x.r.gross : 0), 0) / totalMiles : 0

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Оплачено всего" value={usd.format(totalGross)} />
        <Stat label="Чистыми" value={usd.format(totalNet)} />
        <Stat label="Грузов" value={String(rows.length)} />
        <Stat label="Средний RPM" value={totalMiles > 0 ? `$${avgRpm.toFixed(2)}/mi` : '—'} />
      </div>

      {rows.length === 0 ? (
        <p className="panel p-6 text-[13px] text-white/60">Пока ни один груз не отмечен оплаченным.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map(({ load, r }) => (
            <div key={load.id} className="panel flex items-center gap-4 p-4">
              <Link href={`/loads/${load.id}`} className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-medium">
                  {load.invoiceNumber} · {load.origin ?? '—'} → {load.destination ?? '—'}
                </div>
                <div className="mt-0.5 text-[12px] text-white/60">
                  {load.paidAt ? new Date(load.paidAt).toLocaleDateString('ru-RU') : '—'}
                  {r ? (
                    <>
                      {' '}
                      · чистыми {usd.format(r.net)} · {r.allInRpm.toFixed(2)} $/mi · {r.totalMiles} mi
                    </>
                  ) : null}
                </div>
              </Link>
              <span className="nums shrink-0 text-[15px] font-bold">{usd.format(load.rate)}</span>
              {rateCons.get(load.id) && <RateConButton docId={rateCons.get(load.id)!} compact />}
              <PaidToggle loadId={load.id} paid />
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function Stat({
  label,
  value,
  tone,
  info,
}: {
  label: string
  value: string
  tone?: 'warn' | 'bad'
  info?: string
}) {
  return (
    <div className="panel px-4 py-3">
      <div
        className={`nums text-lg font-bold ${
          tone === 'bad' ? 'text-bad-400' : tone === 'warn' ? 'text-warn-400' : ''
        }`}
      >
        {value}
      </div>
      <div className="mt-0.5 flex items-center gap-1 text-[10px] uppercase tracking-wider text-white/62">
        {label}
        {info && <Info text={info} />}
      </div>
    </div>
  )
}
