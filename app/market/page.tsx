import { Suspense } from 'react'
import { PageHeader } from '@/components/page-header'
import { RoutePlanSection } from '@/components/route-plan-section'
import { MarketTabs } from '@/app/brokers/market-tabs'
import { companyScope } from '@/lib/session'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'

export const dynamic = 'force-dynamic'

/**
 * «Рынок» (11/07/26) — куда отправить трак: горячие штаты, ставки DAT по регионам и
 * направлениям из штата, где стоит трак; вкладкой — «Толлы». До этого план стоял
 * первым экраном раздела «Рынок», под ним — справочник брокеров и складов и
 * проверка по MC: четыре дела под одним словом. Справочник теперь — «Брокеры».
 */
export default async function MarketPage() {
  await companyScope()
  const locale = await getLocale()
  return (
    <main className="page">
      <PageHeader title={t(locale, 'nav.market')} subtitle={t(locale, 'market.subtitle')} />
      <MarketTabs active="rates" locale={locale} />
      <Suspense fallback={<div className="panel h-64 animate-pulse" aria-hidden />}>
        <RoutePlanSection />
      </Suspense>
    </main>
  )
}
