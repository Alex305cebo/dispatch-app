// DB-backed resolution + the gate for per-dispatcher capabilities. SERVER ONLY (uses
// sql). The registry + types live in the client-safe lib/capabilities.ts.

import 'server-only'
import { sql } from './db'
import type { CurrentUser } from './session'
import { CAPABILITY_DEFAULTS, type CapabilityKey } from './capabilities'

/** Effective capabilities for one dispatcher: defaults with their per-user overrides
 * applied. (Admins aren't stored here — they implicitly have everything.) */
export async function capabilitiesFor(userId: number): Promise<Record<CapabilityKey, boolean>> {
  const rows = (await sql`
    SELECT capability, allowed FROM user_capabilities WHERE user_id = ${userId}`) as {
    capability: string
    allowed: boolean
  }[]
  const out = { ...CAPABILITY_DEFAULTS }
  for (const r of rows) if (r.capability in out) out[r.capability as CapabilityKey] = r.allowed
  return out
}

/** The gate: admins always pass; a dispatcher passes per their effective capability. */
export async function can(user: CurrentUser | null, key: CapabilityKey): Promise<boolean> {
  if (!user) return false
  if (user.role === 'admin') return true
  return (await capabilitiesFor(user.id))[key] ?? false
}

/** Set (or update) one dispatcher's override for a capability. */
export async function setUserCapability(userId: number, key: CapabilityKey, allowed: boolean): Promise<void> {
  await sql`
    INSERT INTO user_capabilities (user_id, capability, allowed)
    VALUES (${userId}, ${key}, ${allowed})
    ON CONFLICT (user_id, capability) DO UPDATE SET allowed = ${allowed}`
}
