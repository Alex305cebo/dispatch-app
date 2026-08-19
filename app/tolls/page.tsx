import { Info } from '@/components/info'
import { TollsClient } from './tolls-client'
import { hereKey } from '@/lib/keys'
import { hereUsage } from '@/lib/tolls-here'
import { defaultTruck } from '@/lib/loads'
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
  const [key, usage, truck] = await Promise.all([hereKey(), hereUsage(), defaultTruck(companyId)])

  return (
    <main className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
        {t(locale, 'tolls.title')}
        <Info text={t(locale, 'tolls.info')} />
      </h1>
      <p className="mb-5 text-[13px] text-white/65">{t(locale, 'tolls.subtitle')}</p>

      <TollsClient hasKey={key !== ''} used={usage.used} cap={usage.cap} />
    </main>
  )
}
