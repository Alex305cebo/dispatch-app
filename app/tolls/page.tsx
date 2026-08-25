import { Info } from '@/components/info'
import { TollsClient } from './tolls-client'
import { TollMoney } from './toll-money'
import { TollGuide } from './toll-guide'
import { tollSpend, type TollLoad } from '@/lib/toll-spend'
import { hereKey } from '@/lib/keys'
import { hereUsage } from '@/lib/tolls-here'
import { defaultTruck, listTrucks } from '@/lib/loads'
import { truckLabel } from '@/lib/map'
import { tollLoadChoices } from '@/app/actions'
import { citySuggestions } from '@/lib/city-suggest'
import { sql } from '@/lib/db'
import { companyScope } from '@/lib/session'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'

export const dynamic = 'force-dynamic'

/**
 * «Платные дороги» — сколько стоит проезд по маршруту и стоит ли объезжать.
 *
 * Раздел отвечает на вопрос, который до сих пор считали на глаз: восточные рейсы
 * через Пенсильванию и Иллинойс отдают на толлах трёхзначные суммы, а в расчёте
 * прибыли груза (lib/profit.ts) их нет вообще — то есть чистая по таким рейсам
 * была завышена ровно на эту сумму.
 */
export default async function TollsPage() {
  const locale = await getLocale()
  const companyId = await companyScope()
  const [key, usage, , cityRows, trucks, loadChoices, tollRows] = await Promise.all([
    hereKey(),
    hereUsage(),
    defaultTruck(companyId),
    // Города собственных грузов — они и есть самые вероятные подсказки: парк
    // ездит по одним и тем же направлениям, а мелких городков вроде
    // «Auburndale, FL» ни в одном общем справочнике нет.
    sql`SELECT DISTINCT city FROM (
          SELECT origin AS city FROM loads WHERE company_id = ${companyId} AND origin IS NOT NULL
          UNION SELECT destination FROM loads WHERE company_id = ${companyId} AND destination IS NOT NULL
        ) x`,
    listTrucks(companyId),
    tollLoadChoices(),
    // toll_cost берём сырым, а не через маппер грузов: тот превращает NULL в ноль,
    // а разница между «дорога была бесплатной» и «мы не считали» — весь смысл
    // нижнего блока.
    sql`SELECT id, rate, loaded_miles, deadhead_miles, toll_cost, origin, destination,
               status, pickup_date, created_at
        FROM loads WHERE company_id = ${companyId}`,
  ])

  const SPEND_DAYS = 30
  const spend = tollSpend(
    (tollRows as Record<string, unknown>[]).map(
      (r): TollLoad => ({
        id: Number(r.id),
        rate: Number(r.rate) || 0,
        miles: (Number(r.loaded_miles) || 0) + (Number(r.deadhead_miles) || 0),
        tolls: r.toll_cost == null ? null : Number(r.toll_cost),
        origin: (r.origin as string) ?? null,
        destination: (r.destination as string) ?? null,
        status: String(r.status),
        at: String(r.pickup_date ?? r.created_at ?? '').slice(0, 10) || null,
      }),
    ),
    SPEND_DAYS,
    Date.now(),
  )
  const cities = citySuggestions((cityRows as { city: string }[]).map((r) => r.city))

  return (
    <main className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
        {t(locale, 'tolls.title')}
        <Info text={t(locale, 'tolls.info')} />
      </h1>
      <p className="mb-5 text-[13px] text-white/65">{t(locale, 'tolls.subtitle')}</p>

      <TollsClient
        hasKey={key !== ''}
        used={usage.used}
        cap={usage.cap}
        cities={cities}
        trucks={trucks.map((tr) => ({ id: tr.id, label: truckLabel(tr) }))}
        loads={loadChoices}
      />

      {/* Ниже калькулятора — то, ради чего в раздел заходят второй раз: сколько
          платные дороги уже стоили парку и что вообще нужно знать про них в США. */}
      <TollMoney spend={spend} days={SPEND_DAYS} locale={locale} />
      <TollGuide />
    </main>
  )
}
