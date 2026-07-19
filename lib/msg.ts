// calcLoad and the DB CHECKs shout in English — that's right for a log and wrong for
// a dispatcher. One translator, because both the form and the server actions show
// these to the same person.

export function humanError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)

  if (/loaded_miles|Loaded miles/.test(raw)) return 'Укажи мили — без них расчёта нет.'
  if (/transit_days|Transit days/.test(raw)) return 'Дней в пути должно быть больше нуля.'
  if (/deadhead_miles|Deadhead/.test(raw)) return 'Deadhead не может быть отрицательным.'
  if (/\bMPG\b/.test(raw)) return 'MPG должен быть больше нуля — проверь настройки трака.'
  if (/Rate cannot|\brate\b/.test(raw)) return 'Ставка не может быть отрицательной.'
  if (/under 100%/.test(raw)) {
    return 'Водитель, факторинг и диспетч вместе должны забирать меньше 100% гросса.'
  }
  return raw
}
