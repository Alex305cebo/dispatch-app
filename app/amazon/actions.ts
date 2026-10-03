'use server'

// Действия раздела «Amazon». Отдельным файлом, а не в app/actions.ts: раздел свой,
// таблица своя (amazon_trips), общего с грузами у них только траки.

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { sql } from '@/lib/db'
import { confirmDelete, demoReadOnly, getCurrentUser } from '@/lib/session'
import { truckBelongs } from '@/lib/loads'
import { amazonTripBelongs } from '@/lib/amazon'
import { AMAZON_STATUSES, stopsFromJson, type AmazonStatus, type AmazonStop } from '@/lib/amazon-relay'
import { isOwnerCompany } from '@/lib/company'
import { t } from '@/lib/i18n'
import { getLocale } from '@/lib/i18n-server'

async function writeGuard(): Promise<{ error: string } | null> {
  const user = await getCurrentUser()
  if (!user) return { error: t(await getLocale(), 'actions.signInRequired') }
  return demoReadOnly()
}

export type AmazonTripInput = {
  vrid: string
  tourId: string
  truckId: number | null
  stops: AmazonStop[]
  rate: string
  miles: string
  trailerNo: string
  trailerOwner: string
  loadKind: string
  notes: string
  rawText: string
}

const short = (v: string, n: number) => {
  const s = v.trim().slice(0, n)
  return s || null
}

const money = (v: string): number | null => {
  const n = Number(v.replace(/[$,\s]/g, ''))
  return v.trim() && Number.isFinite(n) && n >= 0 ? n : null
}

/** Новый рейс или правка существующего (id). */
export async function saveAmazonTrip(input: AmazonTripInput, id?: number): Promise<{ error: string } | { id: number }> {
  const ro = await writeGuard()
  if (ro) return ro
  const locale = await getLocale()
  const user = (await getCurrentUser())!
  const stops = stopsFromJson(input.stops)
  const vrid = short(input.vrid, 40)?.toUpperCase() ?? null
  if (!vrid && !stops.length) return { error: t(locale, 'amazon.needVridOrStop') }
  if (input.truckId != null && !(await truckBelongs(user.companyId, input.truckId)))
    return { error: t(locale, 'actions.truckNotFound') }
  const startDate = stops.find((s) => s.date && /^\d{4}-\d{2}-\d{2}$/.test(s.date))?.date ?? null
  const owner = input.trailerOwner === 'amazon' || input.trailerOwner === 'own' ? input.trailerOwner : null
  const kind = input.loadKind === 'drop' || input.loadKind === 'live' ? input.loadKind : null
  const vals = {
    truck: input.truckId,
    vrid,
    tour: short(input.tourId, 40)?.toUpperCase() ?? null,
    stops: JSON.stringify(stops),
    startDate,
    rate: money(input.rate),
    miles: money(input.miles),
    trailer: short(input.trailerNo, 40)?.toUpperCase() ?? null,
    owner,
    kind,
    notes: short(input.notes, 2000),
  }

  if (id) {
    if (!(await amazonTripBelongs(user.companyId, id))) return { error: t(locale, 'amazon.notFound') }
    await sql`
      UPDATE amazon_trips SET truck_id = ${vals.truck}, vrid = ${vals.vrid}, tour_id = ${vals.tour},
        stops = ${vals.stops}, start_date = ${vals.startDate}, rate = ${vals.rate}, miles = ${vals.miles},
        trailer_no = ${vals.trailer}, trailer_owner = ${vals.owner}, load_kind = ${vals.kind}, notes = ${vals.notes}
      WHERE id = ${id} AND company_id = ${user.companyId}`
    revalidatePath('/amazon')
    return { id }
  }

  // Тот же VRID второй раз — скорее всего, вставили рейс повторно.
  if (vrid) {
    const dup = await sql`SELECT id FROM amazon_trips WHERE company_id = ${user.companyId} AND vrid = ${vrid} AND status <> 'cancelled' LIMIT 1`
    if (dup[0]) return { error: t(locale, 'amazon.duplicate') }
  }
  const res = await sql`
    INSERT INTO amazon_trips (company_id, truck_id, dispatcher_id, vrid, tour_id, stops, start_date, rate, miles,
      trailer_no, trailer_owner, load_kind, notes, raw_text)
    VALUES (${user.companyId}, ${vals.truck}, ${user.id}, ${vals.vrid}, ${vals.tour}, ${vals.stops}, ${vals.startDate},
      ${vals.rate}, ${vals.miles}, ${vals.trailer}, ${vals.owner}, ${vals.kind}, ${vals.notes}, ${short(input.rawText, 20000)})`
  revalidatePath('/amazon')
  return { id: Number(res.insertId) }
}

export async function setAmazonTripStatus(id: number, status: AmazonStatus): Promise<{ error: string } | void> {
  const ro = await writeGuard()
  if (ro) return ro
  const locale = await getLocale()
  const user = (await getCurrentUser())!
  if (!AMAZON_STATUSES.includes(status)) return { error: t(locale, 'actions.noAccess') }
  if (!(await amazonTripBelongs(user.companyId, id))) return { error: t(locale, 'amazon.notFound') }
  await sql`UPDATE amazon_trips SET status = ${status} WHERE id = ${id} AND company_id = ${user.companyId}`
  revalidatePath('/amazon')
}

export async function setAmazonTripTruck(id: number, truckId: number | null): Promise<{ error: string } | void> {
  const ro = await writeGuard()
  if (ro) return ro
  const locale = await getLocale()
  const user = (await getCurrentUser())!
  if (!(await amazonTripBelongs(user.companyId, id))) return { error: t(locale, 'amazon.notFound') }
  if (truckId != null && !(await truckBelongs(user.companyId, truckId))) return { error: t(locale, 'actions.truckNotFound') }
  await sql`UPDATE amazon_trips SET truck_id = ${truckId} WHERE id = ${id} AND company_id = ${user.companyId}`
  revalidatePath('/amazon')
}

/** Удаление — со словом DELETE, как у грузов; в Журнал владельца. */
export async function deleteAmazonTrip(id: number, confirm: string): Promise<{ error: string } | void> {
  const ro = await writeGuard()
  if (ro) return ro
  const locale = await getLocale()
  const check = await confirmDelete(confirm, locale)
  if ('error' in check) return { error: check.error }
  const trip = await amazonTripBelongs(check.user.companyId, id)
  if (!trip) return { error: t(locale, 'amazon.notFound') }
  await sql`DELETE FROM amazon_trips WHERE id = ${id} AND company_id = ${check.user.companyId}`
  if (isOwnerCompany(check.user.companyId)) {
    const h = await headers()
    const ip = (h.get('x-forwarded-for') ?? '').split(',')[0]!.trim() || null
    const route = trip.stops.map((s) => s.code ?? s.city).filter(Boolean)
    await sql`
      INSERT INTO audit_log (who, action, target, from_loc, to_loc, ip, user_agent)
      VALUES (${check.user.name || 'dispatcher'}, 'delete_amazon_trip', ${trip.vrid ?? `#${id}`},
        ${route[0] ?? null}, ${route.at(-1) ?? null}, ${ip}, ${h.get('user-agent')})`
  }
  revalidatePath('/amazon')
}
