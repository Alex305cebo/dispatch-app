'use client'

// «Куда отправить трак» вне «Траков»: тот же планировщик, но без карты рядом.
// На «Траках» трак выбирали пином на карте и красили штаты выручкой в день; здесь
// карты нет, поэтому выбранного трака нет (null) и кнопки «На карте» тоже.

import { RoutePlanner, useRoutePlan, type PlanSnaps, type PlanTruck } from '@/components/route-planner'

export function RoutePlanStandalone({ trucks, snaps }: { trucks: PlanTruck[]; snaps: PlanSnaps }) {
  const plan = useRoutePlan(trucks, snaps, null)
  return <RoutePlanner plan={plan} trucks={trucks} snaps={snaps} mapButton={false} />
}
