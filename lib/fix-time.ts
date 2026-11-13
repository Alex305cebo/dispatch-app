// Время самой GPS-точки, а не нашего опроса (11/13/26).
//
// Live Share и Samsara раньше писали в fleet_status.eld_seen имя источника
// ('live share', 'samsara'), а updated_at = NOW() на каждом опросе. Карта не могла
// узнать, сколько точке лет: вендор отдаёт одну и ту же старую точку, мы пишем её
// «свежей», трак «стоит», а «Обновить» ничего не меняет. Теперь eld_seen — ISO-время
// точки от устройства, если источник его дал.

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Число (мс или с), строка-число или дата-строка → ISO. Мусор, время из будущего
 * (больше 10 мин вперёд) и старше года — null: такой штамп хуже, чем никакого. */
export function fixTimeIso(x: unknown, now = Date.now()): string | null {
  let ms: number
  if (typeof x === 'number') ms = x
  else if (typeof x === 'string' && x.trim()) {
    const s = x.trim()
    ms = /^\d+(\.\d+)?$/.test(s) ? Number(s) : Date.parse(s)
  } else return null
  if (!Number.isFinite(ms) || ms <= 0) return null
  if (ms < 1e12) ms *= 1000 // секунды
  if (ms > now + 10 * 60_000 || ms < now - 366 * 86_400_000) return null
  return new Date(ms).toISOString()
}

/** Время точки из ответа Live Share (vehicleData): поле в разных версиях API зовётся
 * по-разному, берём первое осмысленное. */
export function liveShareFixTime(data: any, now = Date.now()): string | null {
  const loc = data?.location ?? {}
  const cands = [
    data?.updateDate, loc.updateDate, data?.lastUpdate, loc.lastUpdate, data?.updatedAt, loc.updatedAt,
    data?.dateTime, loc.dateTime, data?.date, loc.date, data?.time, loc.time, data?.timestamp, loc.timestamp,
    data?.gpsTime, loc.gpsTime, data?.locationTime, loc.locationTime,
  ]
  for (const c of cands) {
    const iso = fixTimeIso(c, now)
    if (iso) return iso
  }
  return null
}
