import Link from 'next/link'
import { listReceivables, rateConByLoad } from '@/lib/loads'
import { getCompany } from '@/lib/invoice'
import { usd } from '@/lib/fmt'
import { CompanyForm, PaidToggle } from '@/components/invoice-actions'
import { RateConButton } from '@/components/ratecon-button'
import { Info } from '@/components/info'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const [rec, company, rateCons] = await Promise.all([
    listReceivables(),
    getCompany(),
    rateConByLoad(),
  ])
  const total = rec.reduce((s, r) => s + r.load.rate, 0)
  const overdue = rec.filter((r) => r.overdue)
  const buckets = {
    '0-30': rec.filter((r) => r.bucket === '0-30'),
    '31-45': rec.filter((r) => r.bucket === '31-45'),
    '45+': rec.filter((r) => r.bucket === '45+'),
  }

  return (
    <main className="mx-auto max-w-4xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <header className="mb-5">
        <h1 className="flex items-center gap-2 text-[17px] font-semibold">
          Оплаты (AR)
          <Info side="bottom" text="Все выставленные, но ещё не оплаченные счета, разложенные по возрасту долга (0–30 / 31–45 / 45+ дней). Красным — просрочка сверх срока брокера (Net 30 и т.п.). Пришли деньги — жми «Оплачено». Внизу — данные твоей компании для инвойсов." />
        </h1>
        <p className="text-[13px] text-white/65">
          Кто ещё не заплатил. Инвойс собирается на странице груза после загрузки POD.
        </p>
      </header>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Ждём всего" value={usd.format(total)} />
        <Stat label="0–30 дн." value={usd.format(buckets['0-30'].reduce((s, r) => s + r.load.rate, 0))} />
        <Stat label="31–45 дн." value={usd.format(buckets['31-45'].reduce((s, r) => s + r.load.rate, 0))} tone={buckets['31-45'].length ? 'warn' : undefined} />
        <Stat label="45+ / просрочка" value={usd.format(buckets['45+'].reduce((s, r) => s + r.load.rate, 0))} tone={buckets['45+'].length || overdue.length ? 'bad' : undefined} />
      </div>

      {rec.length === 0 ? (
        <p className="panel p-6 text-[13px] text-white/60">
          Нет неоплаченных инвойсов. Собери инвойс на странице доставленного груза.
        </p>
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

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'warn' | 'bad' }) {
  return (
    <div className="panel px-4 py-3">
      <div
        className={`nums text-lg font-bold ${
          tone === 'bad' ? 'text-bad-400' : tone === 'warn' ? 'text-warn-400' : ''
        }`}
      >
        {value}
      </div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wider text-white/62">{label}</div>
    </div>
  )
}
