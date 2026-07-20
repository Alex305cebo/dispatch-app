// Reads the user identity middleware already resolved and attached as request
// headers — one DB lookup per request (in middleware), not one per Server Component.
import 'server-only'
import { headers } from 'next/headers'

export type CurrentUser = { id: number; name: string; role: 'admin' | 'dispatcher' }

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const h = await headers()
  const id = h.get('x-user-id')
  if (!id) return null
  const role = h.get('x-user-role')
  return { id: Number(id), name: h.get('x-user-name') ?? '', role: role === 'admin' ? 'admin' : 'dispatcher' }
}

/** Throws instead of returning null — for admin-only pages, right after the page's
 * own gate has already confirmed role === 'admin'. Never trust this alone. */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') throw new Error('Admin access required')
  return user
}
