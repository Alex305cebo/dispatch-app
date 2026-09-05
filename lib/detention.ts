/** Стоимость детеншена: первые `freeHr` часов бесплатно, дальше по `rateHr` в час,
 * с округлением до четверти часа — так считают большинство брокеров. */
export function detentionAmount(min: number, rateHr: number, freeHr: number): number {
  const billable = Math.max(0, min - freeHr * 60)
  return (Math.round((billable / 60) * 4) / 4) * rateHr
}
