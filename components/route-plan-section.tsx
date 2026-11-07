// «Куда отправить трак» — раздел «Рынка» (перенесён с «Траков» 18.09.2026:
// вопрос «кому и куда везти» задают здесь, рядом с брокерами, а не на карте парка).
//
// Данные собирает lib/plan-data.ts — те же, что красят карту на «Траках».

import { BarChart3 } from 'lucide-react'
import { companyScope } from '@/lib/session'
import { loadPlanData } from '@/lib/plan-data'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { Empty } from '@/components/empty'
import { RoutePlanStandalone } from '@/components/route-plan-standalone'

export async function RoutePlanSection() {
  const companyId = await companyScope()
  const { trucks, snaps } = await loadPlanData(companyId)
  // С 11/07/26 план — весь первый экран «Рынка», и пустота тут была бы просто белой
  // страницей: без снимка DAT или без траков говорим, почему ставок нет.
  if (!Object.keys(snaps).length || !trucks.length) {
    const locale = await getLocale()
    return (
      <section className="panel p-4">
        <Empty
          icon={BarChart3}
          title={t(locale, 'market.empty')}
          text={t(locale, trucks.length ? 'market.emptyNoSnap' : 'market.emptyNoTrucks')}
          action={trucks.length ? undefined : { href: '/trucks/new', label: t(locale, 'trucks.page.addTruck') }}
        />
      </section>
    )
  }
  return <RoutePlanStandalone trucks={trucks} snaps={snaps} />
}
