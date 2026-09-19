// «Куда отправить трак» — раздел «Рынка» (перенесён с «Траков» 18.09.2026:
// вопрос «кому и куда везти» задают здесь, рядом с брокерами, а не на карте парка).
//
// Данные собирает lib/plan-data.ts — те же, что красят карту на «Траках».

import { companyScope } from '@/lib/session'
import { loadPlanData } from '@/lib/plan-data'
import { RoutePlanStandalone } from '@/components/route-plan-standalone'

export async function RoutePlanSection() {
  const companyId = await companyScope()
  const { trucks, snaps } = await loadPlanData(companyId)
  if (!Object.keys(snaps).length || !trucks.length) return null
  return <RoutePlanStandalone trucks={trucks} snaps={snaps} />
}
