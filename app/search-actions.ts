'use server'

// Список для быстрого поиска (Ctrl+K, components/quick-search.tsx): грузы, траки и
// брокеры компании одним ответом при открытии окна. Ищется уже в браузере
// (lib/quick-search.ts) — на каждую букву без круга сюда. Денег в списке нет: ставка
// в строке поиска не нужна, а право «Финансы» есть не у всех.

import { listLoads, listTrucks } from '@/lib/loads'
import { truckTrailerNumbers } from '@/lib/maintenance'
import { companyScope, getCurrentUser } from '@/lib/session'
import { getLocale } from '@/lib/i18n-server'
import { statusLabel } from '@/components/status'
import { usDate } from '@/lib/fmt'
import { type QuickItem } from '@/lib/quick-search'
import { brokerKeyOf, emailDomain } from '@/lib/broker-key'
import { nameFromEmail } from '@/lib/brokers'

/** Грузов — последние 600: старше ищут уже на «Деньги → Оплачено», а список уходит в
 *  браузер целиком, и год работы парка не должен весить мегабайт. */
const LOADS_MAX = 600

export async function quickSearchIndex(): Promise<QuickItem[]> {
  // Без входа (режим открытого доступа) — пусто: кнопки поиска там и нет.
  if (!(await getCurrentUser())) return []
  const companyId = await companyScope()
  const [locale, loads, trucks, trailers] = await Promise.all([
    getLocale(),
    listLoads(companyId),
    listTrucks(companyId),
    truckTrailerNumbers(companyId).catch(() => new Map<number, string>()),
  ])
  const truckById = new Map(trucks.map((tr) => [tr.id, tr]))
  // Имя брокера — как в справочнике: из рейт-кона, иначе с домена почты.
  const brokerOf = (l: (typeof loads)[number]) => l.brokerName?.trim() || nameFromEmail(l.brokerEmail)
  const truckLabel = (id: number | null) => {
    const tr = id == null ? undefined : truckById.get(id)
    return tr ? tr.number?.trim() || tr.name : null
  }
  const items: QuickItem[] = []

  for (const tr of trucks)
    items.push({
      kind: 'truck',
      href: `/trucks/${tr.id}`,
      title: tr.number?.trim() || tr.name,
      sub: tr.driverName ?? undefined,
      extra: [tr.name, trailers.get(tr.id)].filter(Boolean).join(' '),
    })

  const recent = [...loads]
    .filter((l) => l.status !== 'cancelled')
    .sort((a, b) => (b.pickupDate ?? b.createdAt).localeCompare(a.pickupDate ?? a.createdAt))
    .slice(0, LOADS_MAX)
  recent.forEach((l, i) => {
    const truck = truckLabel(l.truckId)
    const tr = l.truckId == null ? undefined : truckById.get(l.truckId)
    items.push({
      kind: 'load',
      href: `/loads/${l.id}`,
      title: `${l.origin ?? '—'} → ${l.destination ?? '—'}`,
      sub: [`#${l.referenceId?.trim() || l.id}`, statusLabel(locale, l.status), l.pickupDate ? usDate(l.pickupDate) : null, truck]
        .filter(Boolean)
        .join(' · '),
      extra: [brokerOf(l), l.brokerMc, emailDomain(l.brokerEmail), l.invoiceNumber, tr?.driverName, String(l.id)].filter(Boolean).join(' '),
      rank: recent.length - i,
    })
  })

  // Брокеры — из самих грузов и сведены так же, как справочник на «Рынке» (brokerKeyOf:
  // MC, иначе домен почты, иначе название): строка ведёт прямо в карточку брокера.
  const brokers = new Map<string, { name: string | null; mc: string | null; domain: string | null; n: number }>()
  for (const l of loads) {
    const key = brokerKeyOf({ mc: l.brokerMc, email: l.brokerEmail, name: l.brokerName })
    if (!key) continue
    const b = brokers.get(key) ?? { name: null, mc: null, domain: null, n: 0 }
    b.n++
    b.name ??= brokerOf(l)
    b.mc ??= l.brokerMc?.replace(/\D/g, '') || null
    b.domain ??= emailDomain(l.brokerEmail)
    brokers.set(key, b)
  }
  for (const [key, b] of brokers)
    items.push({
      kind: 'broker',
      href: `/brokers/${encodeURIComponent(key)}`,
      title: b.name ?? key,
      sub: b.mc ? `MC ${b.mc}` : (b.domain ?? undefined),
      extra: b.domain ?? undefined,
      rank: b.n,
    })

  return items
}
