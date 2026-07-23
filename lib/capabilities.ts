// Per-dispatcher feature access — the REGISTRY (client-safe, no DB import so the
// admin UI can render the toggles). The DB-backed resolution + gate live in
// capabilities-server.ts. ONE registry is the source of truth: add a capability here
// and it automatically shows up as a toggle in the admin panel and can gate a
// page/action via can(user, key) — no per-feature admin wiring.
//
// Model: admins always have everything. A dispatcher gets each capability's default,
// overridden per-user by rows in `user_capabilities`. Absence of a row = the default.

import { t, type Locale } from './i18n.ts'

export type CapabilityKey = 'dispatcher_report' | 'telegram' | 'finances' | 'edit_trucks'

export type Capability = {
  key: CapabilityKey
  /** What a brand-new dispatcher gets before the admin touches anything. */
  defaultOn: boolean
}

// Order here = order in the admin panel. To add a future capability: add an entry,
// give it a stable key, then gate the relevant page/action with can(user, key).
export const CAPABILITIES: Capability[] = [
  { key: 'dispatcher_report', defaultOn: true },
  { key: 'telegram', defaultOn: false },
  { key: 'finances', defaultOn: true },
  { key: 'edit_trucks', defaultOn: true },
]

export const CAPABILITY_DEFAULTS = Object.fromEntries(
  CAPABILITIES.map((c) => [c.key, c.defaultOn]),
) as Record<CapabilityKey, boolean>

/** Localized label/description for the admin panel's capability toggles. */
export function capabilityMeta(locale: Locale): Record<CapabilityKey, { label: string; description: string }> {
  return {
    dispatcher_report: {
      label: t(locale, 'admin.cap.dispatcherReport.label'),
      description: t(locale, 'admin.cap.dispatcherReport.desc'),
    },
    telegram: {
      label: t(locale, 'admin.cap.telegram.label'),
      description: t(locale, 'admin.cap.telegram.desc'),
    },
    finances: {
      label: t(locale, 'admin.cap.finances.label'),
      description: t(locale, 'admin.cap.finances.desc'),
    },
    edit_trucks: {
      label: t(locale, 'admin.cap.editTrucks.label'),
      description: t(locale, 'admin.cap.editTrucks.desc'),
    },
  }
}
