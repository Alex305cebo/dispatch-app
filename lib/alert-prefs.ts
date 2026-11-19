// Какие события диспетчер хочет видеть (19.11.26, просьба владельца): всплывающие
// окна поверх экрана по умолчанию выключены — события только в колокольчике; «не
// оплачено» по умолчанию выключено совсем. Каждый человек решает за себя в
// «Настройках» → «Профиль» → «Уведомления». Хранится одной строкой JSON в settings
// (ключ на пользователя), без новой таблицы. Файл чистый — без базы, чтобы его
// импортировали и клиент, и тест.

export const ALERT_KINDS = ['notes', 'overdue', 'nogps', 'doc', 'pod', 'dnote'] as const
export type AlertKind = (typeof ALERT_KINDS)[number]

export type AlertPrefs = { popups: boolean } & Record<AlertKind, boolean>

export const ALERT_DEFAULTS: AlertPrefs = {
  popups: false,
  notes: true,
  overdue: false,
  nogps: true,
  doc: true,
  pod: true,
  dnote: true,
}

export function alertPrefsKey(userId: number): string {
  return `alert_prefs:${userId}`
}

/** Из строки базы; всё непонятное — по умолчанию. */
export function parseAlertPrefs(raw: string | null | undefined): AlertPrefs {
  const out = { ...ALERT_DEFAULTS }
  if (!raw) return out
  try {
    const v = JSON.parse(raw) as Record<string, unknown>
    for (const k of Object.keys(out) as (keyof AlertPrefs)[]) if (typeof v[k] === 'boolean') out[k] = v[k] as boolean
  } catch {
    /* битая строка — значения по умолчанию */
  }
  return out
}

/** Вид события по его идентификатору из /api/alerts («notes:12», «overdue:5:2»…). */
export function alertKindOf(id: string): AlertKind | null {
  const k = id.split(':')[0]
  return (ALERT_KINDS as readonly string[]).includes(k ?? '') ? (k as AlertKind) : null
}
