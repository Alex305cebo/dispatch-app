// Per-dispatcher feature access — the REGISTRY (client-safe, no DB import so the
// admin UI can render the toggles). The DB-backed resolution + gate live in
// capabilities-server.ts. ONE registry is the source of truth: add a capability here
// and it automatically shows up as a toggle in the admin panel and can gate a
// page/action via can(user, key) — no per-feature admin wiring.
//
// Model: admins always have everything. A dispatcher gets each capability's default,
// overridden per-user by rows in `user_capabilities`. Absence of a row = the default.

export type CapabilityKey = 'dispatcher_report' | 'telegram' | 'finances' | 'edit_trucks'

export type Capability = {
  key: CapabilityKey
  label: string
  description: string
  /** What a brand-new dispatcher gets before the admin touches anything. */
  defaultOn: boolean
}

// Order here = order in the admin panel. To add a future capability: add an entry,
// give it a stable key, then gate the relevant page/action with can(user, key).
export const CAPABILITIES: Capability[] = [
  {
    key: 'dispatcher_report',
    label: 'Отчёт «По диспетчерам»',
    description: 'Видеть вкладку «Финансы → По диспетчерам» — заработок ВСЕХ диспетчеров по неделям.',
    defaultOn: true,
  },
  {
    key: 'telegram',
    label: 'Telegram',
    description: 'Подключить свой Telegram и переписываться с водителями прямо в приложении.',
    defaultOn: false,
  },
  {
    key: 'finances',
    label: 'Финансы (оплаты, инвойсы)',
    description: 'Открывать раздел «Финансы», собирать инвойсы и отмечать грузы оплаченными.',
    defaultOn: true,
  },
  {
    key: 'edit_trucks',
    label: 'Редактирование траков и расходов',
    description: 'Менять экономику трака (MPG, ставка водителя, фиксы) — влияет на все расчёты.',
    defaultOn: true,
  },
]

export const CAPABILITY_DEFAULTS = Object.fromEntries(
  CAPABILITIES.map((c) => [c.key, c.defaultOn]),
) as Record<CapabilityKey, boolean>
