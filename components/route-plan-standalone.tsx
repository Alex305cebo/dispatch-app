'use client'

// «Куда отправить трак» вне «Траков»: тот же планировщик, но без карты рядом.
// На «Траках» трак выбирали пином на карте; здесь карты нет, поэтому выбранного
// трака нет (null), а «Показать на карте» ведёт на карту парка с этим траком и
// штатом в адресе — там карта включает слой «Из штата» и красит направления.

import { RoutePlanner, useRoutePlan, type PlanSnaps, type PlanTruck } from '@/components/route-planner'

export function RoutePlanStandalone({ trucks, snaps }: { trucks: PlanTruck[]; snaps: PlanSnaps }) {
  const plan = useRoutePlan(trucks, snaps, null)
  const p = new URLSearchParams()
  if (plan.truck) p.set('plan', String(plan.truck.id))
  if (plan.origin) p.set('from', plan.origin)
  return <RoutePlanner plan={plan} trucks={trucks} snaps={snaps} mapHref={`/trucks?${p}#fleet-map`} />
}
