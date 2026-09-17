// Пояс по штату — для окон остановок, у которых есть только «Olathe, KS», без координат.
// Отдельно от lib/tz.ts: тот тянет tz-lookup (150 КБ полигонов), а это нужно и в
// клиентском бандле /loads. Штаты с двумя поясами (TX, FL, ID, KY, TN, NE, KS, SD, ND,
// OR, MI, IN) отданы поясу большей части населения: ошибка в час на «опаздывает» —
// шум, а геокодить каждую остановку ради неё дорого.
const byZone = (zone: string, states: string) => states.split(' ').map((s) => [s, zone] as const)
const STATE_ZONE: Record<string, string> = Object.fromEntries([
  ...byZone('America/New_York', 'CT DE FL GA IN KY ME MD MA MI NH NJ NY NC OH PA RI SC VT VA WV DC'),
  ...byZone('America/Chicago', 'AL AR IL IA KS LA MN MS MO NE ND OK SD TN TX WI'),
  ...byZone('America/Denver', 'CO ID MT NM UT WY'),
  ...byZone('America/Phoenix', 'AZ'),
  ...byZone('America/Los_Angeles', 'CA NV OR WA'),
  ...byZone('America/Anchorage', 'AK'),
  ...byZone('Pacific/Honolulu', 'HI'),
])

/** «Olathe, KS 66061» → America/Chicago; штат не найден → null. */
export function zoneForPlace(place: string | null | undefined): string | null {
  const m = /\b([A-Z]{2})\b(?:\s+\d{5}(?:-\d{4})?)?\s*$/.exec((place ?? '').trim().toUpperCase())
  return m ? (STATE_ZONE[m[1]!] ?? null) : null
}
