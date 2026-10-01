// Кабинеты. Одна база, у каждой компании свой company_id на всех её строках.
//
// • 'default' — компания владельца установки (на app.mayalogisticsinc.com — Maya).
//   Только у неё ELD, Telegram, ключи ИИ и Админка.
// • 'demo' — общая витрина (lib/demo.ts), только чтение.
// • всё остальное — свой кабинет диспетчера: зашёл через Google на dispatch4you.pro и
//   получил пустую TMS, где видит только своё.
//
// Файл без зависимостей — его проверяет node --test и импортирует middleware.

export type CompanyId = string

export const OWNER_COMPANY = 'default'
export const DEMO_COMPANY_ID = 'demo'

/** Компания владельца установки. Только ей открыты общие вещи: Админка, ELD, Telegram,
 * ключи ИИ, журнал входов. */
export function isOwnerCompany(companyId: CompanyId): boolean {
  return companyId === OWNER_COMPANY
}

/** Свой кабинет диспетчера — не владелец и не витрина. */
export function isWorkspace(companyId: CompanyId): boolean {
  return companyId !== OWNER_COMPANY && companyId !== DEMO_COMPANY_ID
}

/** GPS парка (fleet_status) хранится по номеру трака, а номер «101» бывает в любой
 * компании. Совпадение номеров не должно показывать кабинету чужую машину на карте,
 * поэтому позиции видят только владелец (его ELD) и витрина (её юниты DEMO-…). */
export function seesFleetGps(companyId: CompanyId): boolean {
  return !isWorkspace(companyId)
}

/** Компания пользователя из строки users. Витрина узнаётся по is_demo, как и раньше:
 * её аккаунт старше колонки company_id. */
export function userCompany(row: { is_demo: boolean | number; company_id?: string | null }): CompanyId {
  if (row.is_demo) return DEMO_COMPANY_ID
  const id = (row.company_id ?? '').trim()
  return id || OWNER_COMPANY
}

/** Новый id кабинета: 'w' + 16 hex. Не номер подряд — по нему не угадать соседа. */
export function newWorkspaceId(): CompanyId {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return 'w' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

// Настройки (таблица settings) — общий словарь «ключ → значение». Большая часть ключей
// принадлежит установке (ключи API, кэши рынка и геокодера), но реквизиты компании,
// заметки о брокерах и складах, факторинг и условия детеншена у каждого кабинета свои.
// Для кабинета такие ключи получают приставку, у владельца и витрины остаются как были
// — их данные не переезжают.
const COMPANY_KEY_PREFIXES = ['co_', 'detention_', 'factoring_settings', 'broker_note:', 'facility_note:']

export function isCompanyKey(key: string): boolean {
  return COMPANY_KEY_PREFIXES.some((p) => key.startsWith(p))
}

export function companySettingKey(key: string, companyId: CompanyId): string {
  return isWorkspace(companyId) && isCompanyKey(key) ? `c:${companyId}:${key}` : key
}
