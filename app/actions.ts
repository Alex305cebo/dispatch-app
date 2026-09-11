'use server'

// Правило про router.refresh() после этих действий: он НЕ нужен.
//
// Проверено по исходникам Next 15.5 (server/app-render/action-handler.js):
// ответ серверного действия строится с `skipFlight: !workStore.pathWasRevalidated`.
// Стоит действию вызвать revalidatePath — и ответ уже содержит заново отрисованное
// дерево текущей страницы, которое роутер применяет сам. Вызов router.refresh()
// рядом запрашивает ту же страницу ВТОРОЙ раз, то есть каждое сохранение стоило
// двух полных серверных рендеров вместо одного.
//
// Осознанно оставлены только те refresh, за которыми нет revalidatePath: кнопки
// «Обновить», опросы по таймеру, выход из аккаунта и смена языка (там меняется кука,
// а не данные).

import { DOC_KINDS } from '@/lib/docs'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { sql } from '@/lib/db'
import { humanError } from '@/lib/msg'
import type { LoadStatus } from '@/lib/map'
import type { LoadStop } from '@/lib/stops'
import type { QrLoad } from '@/lib/qr-load'
import type { TruckSettings } from '@/lib/profit'
import { checkBroker, checkBrokerByDot, type BrokerCheck, type RcContext } from '@/lib/fmcsa'
import { formatDriverInfo, toQrLoad } from '@/lib/ratecon'
import { cityCoordsBest } from '@/lib/geo-routing'
import { haversineMiles } from '@/lib/geo'
import { nextLoadStatus, GEOFENCE_MI } from '@/lib/load-status'
import type { DocClass } from '@/lib/ai-doc'
import { docBelongs, getLoad, loadBelongs, truckBelongs } from '@/lib/loads'
import { knownBrokerMc } from '@/lib/brokers'
import type { HistoryLeg } from '@/lib/trip-history'
import { autoInvoiceIfReady, buildInvoicePacket, type Company } from '@/lib/invoice'
import { dispatcherPhoneKey, getSetting, setSetting } from '@/lib/settings'
import { companyScope, confirmDelete, demoReadOnly, getCurrentUser } from '@/lib/session'
import { can } from '@/lib/capabilities-server'
import type { CapabilityKey } from '@/lib/capabilities'
import { t } from '@/lib/i18n'
import { getLocale } from '@/lib/i18n-server'

export async function vetBroker(mc: string, ctx: RcContext): Promise<BrokerCheck | { error: string }> {
  return checkBroker(mc, ctx, await getLocale())
}

/**
 * Личный номер диспетчера — для блока «Driver Info», который отправляют брокеру.
 *
 * Лежит в settings под ключом с id пользователя, а не колонкой в users: номер есть
 * не у всех и меняется у одного человека, а не у схемы. Тот же приём, что уже
 * применён к ключам Telegram (lib/telegram.ts).
 */
export async function saveDispatcherPhone(phone: string): Promise<{ error: string } | void> {
  const ro = await demoReadOnly()
  if (ro) return ro
  const user = await getCurrentUser()
  if (!user) return { error: t(await getLocale(), 'actions.noAccess') }
  await setSetting(dispatcherPhoneKey(user.id), phone.trim())
  revalidatePath('/trucks')
}

/** Поиск брокера по названию — когда MC на бумаге не напечатан. Возвращает
 * кандидатов из FMCSA; выбирает человек. */
/**
 * Подобрать MC тем брокерам, у кого его нет, — сам, без кнопки.
 *
 * Номер компании не работа диспетчера: в рейт-коне его чаще всего нет, а в реестре
 * он есть, и достать его должно приложение. Зовётся при открытии раздела и с крона
 * (app/api/eld-poll), партиями — реестр отвечает медленно, а торопиться некуда.
 *
 * Возвращает, сколько проставлено и сколько ещё осталось: по остатку страница решает,
 * звать ли ещё раз.
 */
export async function fillBrokerMc(): Promise<{
  filled: number
  left: number
  reason: 'ok' | 'no_key' | 'nothing_to_do'
}> {
  const companyId = await companyScope()
  // Демо-парк — выдуманные брокеры: тратить на них обращения к реестру незачем.
  if (companyId === 'demo') return { filled: 0, left: 0, reason: 'nothing_to_do' }
  const { backfillBrokerMc } = await import('@/lib/mc-backfill')
  const res = await backfillBrokerMc(companyId)
  if (res.filled > 0) {
    revalidatePath('/brokers')
    revalidatePath('/loads')
  }
  return { filled: res.filled, left: res.left, reason: res.reason }
}

/**
 * Поправить данные брокера руками — по всем его грузам сразу.
 *
 * Ошибиться может и реестр, и разбор документа: не тот MC, телефон рядового
 * менеджера вместо офиса, почта, на которую счёт не примут. Исправлять это в каждом
 * грузе по отдельности никто не станет, поэтому правка идёт по всей истории брокера.
 *
 * Ищем его по MC, если он есть, иначе по имени: это те же два ключа, по которым
 * строки и группируются в списке.
 */
export async function updateBrokerInfo(
  find: { mc: string | null; name: string | null },
  patch: { mc?: string; name?: string; phone?: string; email?: string },
): Promise<{ updated: number } | { error: string }> {
  const ro = await demoReadOnly()
  if (ro) return ro
  const locale = await getLocale()
  const companyId = await companyScope()

  // Имя вперёд MC не случайно. Один и тот же ошибочный номер (обычно НАШ, попавший
  // из рейт-кона) стоит сразу у нескольких брокеров, и правка «по MC» перекрасила бы
  // их всех разом. Имя в этом смысле надёжнее: строка в списке — это его имя.
  const findMc = (find.mc ?? '').replace(/\D/g, '')
  const findName = (find.name ?? '').trim().toLowerCase()
  if (!findMc && !findName) return { error: t(locale, 'brokers.editNoTarget') }

  // Пустая строка в поле = «оставить как есть», а не «стереть»: форма показывает все
  // поля сразу, и очищенное поле почти всегда значит «этого я не знаю», а не «убери».
  const mc = patch.mc?.replace(/\D/g, '') || null
  // Наш собственный номер брокеру не принадлежит: в рейт-коне их два, и путаница
  // между ними — самая частая ошибка разбора. Молча записать её обратно нельзя.
  const { getCompany } = await import('@/lib/invoice')
  const mine = /\bMC\s*#?\s*[:\-]?\s*(\d{5,8})\b/i.exec((await getCompany()).mcdot ?? '')?.[1]
  if (mc && mine && mc === mine) return { error: t(locale, 'brokers.editOwnMc') }
  const name = patch.name?.trim() || null
  const phone = patch.phone?.trim() || null
  const email = patch.email?.trim() || null
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: t(locale, 'brokers.editBadEmail') }
  if (!mc && !name && !phone && !email) return { updated: 0 }

  const rows = (await sql`
    UPDATE loads SET
      broker_mc = coalesce(${mc}, broker_mc),
      broker_name = coalesce(${name}, broker_name),
      broker_phone = coalesce(${phone}, broker_phone),
      broker_email = coalesce(${email}, broker_email)
    WHERE company_id = ${companyId}
      AND (
        (${findName} <> '' AND lower(coalesce(broker_name, '')) = ${findName})
        OR (${findName} = '' AND ${findMc} <> ''
            AND regexp_replace(coalesce(broker_mc, ''), '[^0-9]', '', 'g') = ${findMc})
      )
    RETURNING id`) as { id: number }[]

  revalidatePath('/brokers')
  revalidatePath('/loads')
  return { updated: rows.length }
}

/**
 * Реквизиты компании из списка крупнейших брокеров: MC, DOT, статус authority, город.
 *
 * В самом списке их нет намеренно — вписанный руками MC устаревает и врёт. Поэтому
 * достаём из реестра по названию в момент, когда карточку открыли, и тем же правилом
 * («Molo Solutions, LLC» → «Molo Solutions»), что и автоподбор: у этих компаний имя
 * в реестре почти всегда длиннее того, под которым их знают.
 */
/** Реквизиты компании из реестра — то, что показывает карточка крупного брокера. */
type TopFacts = {
  mc: string | null
  dot: string | null
  legalName: string
  city: string | null
  state: string | null
  authority: string | null
  phone: string | null
}

export async function topBrokerInfo(name: string): Promise<TopFacts | { error: string }> {
  const locale = await getLocale()

  // Реквизиты крупных брокеров не меняются годами, а достаются пятью запросами к
  // реестру: один поиск и по одному на каждого однофамильца. Держим ответ месяц —
  // карточка открывается мгновенно и переживает недоступность реестра.
  const CACHE_KEY = 'top_broker_facts'
  const MONTH = 30 * 86400000
  type Cached = { at: string; facts: TopFacts }
  const store: Record<string, Cached> = JSON.parse((await getSetting(CACHE_KEY)) || '{}')
  const hit = store[name.toLowerCase()]
  if (hit && Date.now() - Date.parse(hit.at) < MONTH) return hit.facts

  const { saferSearch, saferSnapshot } = await import('@/lib/safer')
  const { chooseCompany, compact, searchTerms } = await import('@/lib/broker-match')
  const { TOP_BROKERS } = await import('@/lib/brokers-top')

  // Некоторые бренды в реестре записаны иначе («MODE Global» = MODE TRANSPORTATION
  // LLC) — ищем под реестровым именем из справочника, показываем под брендовым.
  const known = TOP_BROKERS.find((b) => compact(b.name) === compact(name))
  const lookup = known?.alias ?? name

  // Выверенный вручную DOT — без поиска вовсе: у крупных брендов в реестре
  // однофамильцы, и правило имени между ними бессильно.
  if (known?.dot) {
    const snap0 = await saferSnapshot(known.dot)
    if (snap0) {
      const p = /([A-Za-z .'-]+),\s*([A-Z]{2})\s+\d{5}/.exec(snap0.address ?? '')
      const facts: TopFacts = {
        mc: snap0.mc ?? known.mc ?? null,
        dot: known.dot,
        legalName: snap0.legalName ?? name,
        city: p?.[1]?.trim() ?? null,
        state: p?.[2] ?? null,
        authority: snap0.operatingStatus,
        phone: snap0.phone,
      }
      store[name.toLowerCase()] = { at: new Date().toISOString(), facts }
      await setSetting(CACHE_KEY, JSON.stringify(store))
      return facts
    }
  }

  const hits: { dot: string; legalName: string }[] = []
  for (const term of searchTerms(lookup)) {
    for (const h of await saferSearch(term)) if (!hits.some((x) => x.dot === h.dot)) hits.push(h)
    if (hits.some((h) => compact(h.legalName) === compact(lookup))) break
  }
  const want = compact(lookup)
  // Префикс в ОБЕ стороны: у нас «J.B. Hunt Transport Services», в реестре
  // «J.B. HUNT TRANSPORT INC» — короче нашего, и односторонний startsWith его терял.
  const worth = hits
    .filter((h) => {
      const c = compact(h.legalName)
      return c.startsWith(want) || want.startsWith(c)
    })
    .slice(0, 8)

  const cards = []
  const snaps = new Map<string, Awaited<ReturnType<typeof saferSnapshot>>>()
  for (const h of worth) {
    const snap = await saferSnapshot(h.dot)
    if (!snap) continue
    snaps.set(h.dot, snap)
    cards.push({
      dot: h.dot,
      legalName: snap.legalName ?? h.legalName,
      dbaName: snap.dbaName,
      phone: snap.phone,
      entityType: snap.entityType,
      operatingStatus: snap.operatingStatus,
    })
  }

  let best = chooseCompany(lookup, null, cards)
  if (!best && cards.length > 0) {
    // В реестре несколько компаний с этим именем (у Nolan Transportation Group две:
    // настоящая из Атланты и однофамилец 2023 года из Коннектикута). Для автозаписи
    // MC в грузы такая ничья отдаётся человеку, но здесь справочная карточка
    // ИЗВЕСТНОГО брокера — выбираем сами, сужая шаг за шагом: штат штаб-квартиры из
    // нашего справочника → брокерский авторитет → дословное имя → старейший DOT
    // (однофамильцы-подражатели регистрируются недавно, номера у них большие).
    let pool = cards
    if (known?.hq) {
      const st = pool.filter((c) => (snaps.get(c.dot)?.address ?? '').includes(`, ${known.hq} `))
      if (st.length > 0) pool = st
    }
    const brokers = pool.filter((c) => (c.entityType ?? '').toUpperCase().includes('BROKER'))
    if (brokers.length > 0) pool = brokers
    const exact = pool.filter((c) => compact(c.legalName) === want)
    if (exact.length > 0) pool = exact
    best = pool.slice().sort((a, b) => Number(a.dot) - Number(b.dot))[0] ?? null
  }
  const snap = best ? snaps.get(best.dot) : null
  if (!best || !snap) return { error: t(locale, 'fmcsa.nameNotFound').replace('{name}', name) }

  // Город и штат в SAFER лежат второй строкой адреса: «CHICAGO, IL 60607».
  const place = /([A-Za-z .'-]+),\s*([A-Z]{2})\b/.exec(snap.address ?? '')
  const facts: TopFacts = {
    mc: snap.mc,
    dot: best.dot,
    legalName: snap.legalName ?? best.legalName,
    city: place?.[1]?.trim() ?? null,
    state: place?.[2] ?? null,
    authority: snap.operatingStatus,
    phone: snap.phone,
  }
  store[name.toLowerCase()] = { at: new Date().toISOString(), facts }
  await setSetting(CACHE_KEY, JSON.stringify(store))
  return facts
}

export async function findBrokerByName(name: string) {
  const { searchByName } = await import('@/lib/fmcsa')
  return searchByName(name, await getLocale())
}

/**
 * Контакты этого же брокера с ПРОШЛЫХ грузов: почта для счёта, телефон, MC.
 *
 * В FMCSA почты нет вовсе — там только регистрационные данные, — поэтому адрес,
 * куда слать инвойс, живёт ровно в одном месте: в наших же прошлых грузах. Один раз
 * вписали, дальше подставляется само.
 */
export async function brokerContactsFromHistory(
  name: string | null,
  mc: string | null,
): Promise<{
  email: string | null
  phone: string | null
  mc: string | null
  payVia: string | null
}> {
  const companyId = await companyScope()
  const key = (name ?? '').trim().toLowerCase()
  const mcDigits = (mc ?? '').replace(/\D/g, '')
  if (!key && !mcDigits) return { email: null, phone: null, mc: null, payVia: null }
  const rows = (await sql`
    SELECT broker_email, broker_phone, broker_mc, pay_via FROM loads
    WHERE company_id = ${companyId}
      AND (
        (${mcDigits} <> '' AND regexp_replace(coalesce(broker_mc, ''), '[^0-9]', '', 'g') = ${mcDigits})
        OR (${key} <> '' AND lower(coalesce(broker_name, '')) = ${key})
      )
    ORDER BY created_at DESC`) as {
    broker_email: string | null
    broker_phone: string | null
    broker_mc: string | null
    pay_via: string | null
  }[]
  const first = <T>(pick: (r: (typeof rows)[number]) => T | null): T | null =>
    rows.map(pick).find((v) => v != null && String(v).trim() !== '') ?? null
  return {
    email: first((r) => r.broker_email),
    phone: first((r) => r.broker_phone),
    mc: first((r) => r.broker_mc),
    payVia: first((r) => r.pay_via),
  }
}

/** Manual broker lookup from the Brokers page — by MC or DOT number. */
export async function runBrokerCheck(by: 'mc' | 'dot', value: string): Promise<BrokerCheck | { error: string }> {
  const locale = await getLocale()
  return by === 'dot' ? checkBrokerByDot(value, {}, locale) : checkBroker(value, {}, locale)
}

export async function fetchRouteMiles(origin: string, destination: string) {
  const { routeMiles } = await import('@/lib/geo-routing')
  if (!origin?.trim() || !destination?.trim()) return { error: t(await getLocale(), 'actions.needOriginDest') }
  return routeMiles(origin, destination)
}

export async function fetchDiesel() {
  const { dieselPrice } = await import('@/lib/geo-routing')
  return dieselPrice()
}

/**
 * Owner pastes their ZigZag "Live Share" links (one per truck) — we keep the tokens
 * and immediately pull GPS from them. No vendor key needed. GPS only, no HOS.
 */
/**
 * Подключение отслеживания одним полем: человек вставляет то, что у него есть, —
 * ссылку на трак или токен API, — а разбираемся мы.
 *
 * Два поля («ссылки» и «токен Samsara») были честной картиной наших внутренностей
 * и бесполезной для владельца: у парка ОДИН ELD, и половина экрана всегда была
 * чужой. Спросили прямо — «первый раздел кажется бессмысленным», и это правда.
 *
 * Как определяем, что вставили:
 * • ссылка ZigZag (zigzageld.com или любой ?token=) → путь Live Share;
 * • ссылка cloud.samsara.com/…/fleet/viewer/… → объясняем, что это страница, а не
 *   данные, и просим токен (проверено вживую: за ссылкой закрытый GraphQL);
 * • одна строка без пробелов и косых — токен. Чей именно, гадать не надо:
 *   пробуем как Samsara, и если она его не приняла — сохраняем как ссылку ZigZag.
 *   Лишний запрос при сохранении дешевле, чем выпадающий список, в котором
 *   ошибаются.
 */
export async function saveTracking(
  text: string,
): Promise<{ saved: number; updated: number; errors: string[] } | { error: string }> {
  const locale = await getLocale()
  const { parseShareTokens, liveShareSnapshot } = await import('@/lib/eld')
  const { setSetting } = await import('@/lib/settings')
  const raw = text.trim()
  if (!raw) return { error: t(locale, 'tracking.err.empty') }

  if (/samsara\.com/i.test(raw)) return { error: t(locale, 'tracking.err.samsaraLink') }

  const lines = raw.split(/\s+/).filter(Boolean)
  const looksLikeToken = lines.length === 1 && !lines[0]!.includes('/') && lines[0]!.length >= 20

  if (looksLikeToken) {
    const { samsaraSnapshot } = await import('@/lib/eld-samsara')
    await setSetting('samsara_token', lines[0]!)
    const snap = await samsaraSnapshot()
    if (!('error' in snap)) {
      revalidatePath('/trucks')
      revalidatePath('/', 'layout')
      return { saved: 1, updated: snap.updated, errors: snap.errors }
    }
    // Samsara не приняла — значит это не её токен. Убираем за собой и пробуем как
    // ссылку ZigZag: у той токен тоже бывает голым.
    const { deleteSetting } = await import('@/lib/settings')
    await deleteSetting('samsara_token')
  }

  const tokens = parseShareTokens(raw)
  await setSetting('eld_share_tokens', JSON.stringify(tokens))
  const snap = await liveShareSnapshot()
  revalidatePath('/trucks')
  revalidatePath('/', 'layout')
  if ('error' in snap) return { saved: tokens.length, updated: 0, errors: [snap.error] }
  return { saved: tokens.length, updated: snap.updated, errors: snap.errors }
}

/** Отключить отслеживание: убрать и ссылки, и токен. */
export async function clearTracking(): Promise<void> {
  const { deleteSetting } = await import('@/lib/settings')
  await deleteSetting('eld_share_tokens')
  await deleteSetting('samsara_token')
  revalidatePath('/trucks')
  revalidatePath('/', 'layout')
}

/** Manual "Обновить" on /tracking — те же источники, что опрашивает крон, по кнопке. */
export async function refreshFleetStatus(): Promise<{
  updated: number
  errors: string[]
}> {
  // Живой режим карт опрашивает это каждые ~30 с С КАЖДОЙ открытой вкладки. Интервал
  // серверный и один на всех: первая вкладка реально идёт к вендору, остальные получают
  // «без изменений» и просто перечитывают базу — вендор видит один опрос, сколько бы
  // карт ни было открыто.
  const MIN_POLL_MS = 20_000
  const lastPoll = await getSetting('fleet_poll_at')
  if (lastPoll && Date.now() - Number(lastPoll) < MIN_POLL_MS) return { updated: 0, errors: [] }
  await setSetting('fleet_poll_at', String(Date.now()))
  const { fleetSnapshot, liveShareSnapshot } = await import('@/lib/eld')
  const { samsaraSnapshot } = await import('@/lib/eld-samsara')
  const [share, key, sam] = await Promise.all([liveShareSnapshot(), fleetSnapshot(), samsaraSnapshot()])
  // 'no_key' just means the paid vendor API isn't hooked up — expected when the fleet
  // runs on Live Share links only, not worth surfacing as an error every click.
  // 'no_links'/'no_key'/'no_token' — источник просто не подключён (у парка обычно
  // один ELD из трёх). Это состояние, а не поломка, и показывать его жёлтой плашкой
  // при каждом обновлении карты нельзя — приучает не читать сообщения вовсе.
  const quiet = new Set(['no_key', 'no_links', 'no_token', 'bad_links'])
  const errors = [
    ...('error' in share ? (quiet.has(share.error) ? [] : [share.error]) : share.errors),
    ...('error' in key ? (quiet.has(key.error) ? [] : [key.error]) : []),
    ...('error' in sam ? (quiet.has(sam.error) ? [] : [sam.error]) : sam.errors),
  ]
  const updated =
    ('updated' in share ? share.updated : 0) +
    ('updated' in key ? key.updated : 0) +
    ('updated' in sam ? sam.updated : 0)
  revalidatePath('/tracking')
  revalidatePath('/', 'layout')
  return { updated, errors }
}

/** Fired from the nav on every page load/section switch — no cron ever got set up
 * (that needed the owner to sign up for an external pinger, cron-job.org), so GPS
 * only ever moved on the manual "Обновить" click. Riding real navigation instead
 * means it stays fresh while anyone is actually using the app. Throttled server-side
 * (not per-tab) so ten dispatchers clicking around at once still means one real poll,
 * not ten — a Live Share link is 2 HTTP calls each, times however many trucks.
 * Returns whether it actually polled (vs. throttled) — fetching new GPS is useless if
 * the page already on screen never re-renders to show it, so the caller only forces a
 * re-render when there's actually fresh data behind it. */
export async function autoRefreshFleet(): Promise<boolean> {
  const ro = await demoReadOnly()
  if (ro) return false
  const THROTTLE_MS = 3 * 60 * 1000
  const last = await getSetting('fleet_auto_refresh_at')
  if (last && Date.now() - new Date(last).getTime() < THROTTLE_MS) return false
  await setSetting('fleet_auto_refresh_at', new Date().toISOString())

  const { fleetSnapshot, liveShareSnapshot } = await import('@/lib/eld')
  await Promise.all([liveShareSnapshot().catch(() => {}), fleetSnapshot().catch(() => {})])
  // Positions just refreshed — now move any load whose truck has left its pickup/delivery.
  await autoAdvanceLoadStatuses().catch(() => {})
  revalidatePath('/tracking')
  revalidatePath('/trucks', 'layout')
  revalidatePath('/loads')
  revalidatePath('/', 'layout')
  return true
}

/** Advance load status from live GPS: booked → in_transit once the truck has left the
 * pickup, in_transit → delivered once it has left the delivery. Forward-only, geofenced,
 * and gated on a fresh fix so a stale position can't move a load. Decision logic (and its
 * tests) live in lib/load-status.ts; this is the DB read/write + geocoding around it. */
async function autoAdvanceLoadStatuses(): Promise<void> {
  const STALE_MS = 60 * 60 * 1000
  const rows = (await sql`
    SELECT l.id, l.status, l.origin, l.destination, l.pickup_address, l.delivery_address,
           l.pickup_arrived_at, l.delivery_arrived_at, f.lat, f.lng, f.eld_seen
    FROM loads l
    JOIN trucks t ON t.id = l.truck_id
    JOIN fleet_status f ON f.unit = t.number
    WHERE l.status IN ('booked', 'in_transit') AND f.lat IS NOT NULL AND f.lng IS NOT NULL`) as {
    id: number
    status: 'booked' | 'in_transit'
    origin: string | null
    destination: string | null
    pickup_address: string | null
    delivery_address: string | null
    pickup_arrived_at: string | null
    delivery_arrived_at: string | null
    lat: number
    lng: number
    eld_seen: string | null
  }[]

  for (const r of rows) {
    const seen = r.eld_seen ? Date.parse(r.eld_seen) : NaN
    if (!Number.isNaN(seen) && Date.now() - seen > STALE_MS) continue // stale fix — skip
    const truck = { lat: r.lat, lng: r.lng }
    const pickup = await cityCoordsBest(r.pickup_address, r.origin)
    const dest = await cityCoordsBest(r.delivery_address, r.destination)
    const dP = pickup ? haversineMiles(truck, pickup) : null
    const dD = dest ? haversineMiles(truck, dest) : null

    let pickupArrived = r.pickup_arrived_at != null
    let deliveryArrived = r.delivery_arrived_at != null
    // Stamp first arrival at each stop. Delivery only counts once the load is in_transit, so
    // a short haul whose pickup sits inside the delivery geofence can't mark "arrived at
    // delivery" before it's even been loaded.
    if (dP != null && dP <= GEOFENCE_MI && !pickupArrived) {
      await sql`UPDATE loads SET pickup_arrived_at = now() WHERE id = ${r.id} AND pickup_arrived_at IS NULL`
      pickupArrived = true
    }
    if (r.status === 'in_transit' && dD != null && dD <= GEOFENCE_MI && !deliveryArrived) {
      await sql`UPDATE loads SET delivery_arrived_at = now() WHERE id = ${r.id} AND delivery_arrived_at IS NULL`
      deliveryArrived = true
    }

    const next = nextLoadStatus({
      status: r.status,
      distToPickupMi: dP,
      distToDeliveryMi: dD,
      pickupArrived,
      deliveryArrived,
    })
    if (next) {
      // Бумажной проверки здесь больше нет — по той же причине, что и у кнопки в
      // setStatus: трак физически уехал с выгрузки, значит груз доставлен, а POD
      // подъедет фотографией позже. О недостающих бумагах говорит баннер на грузе.
      // Guard on the status we read, so a manual change in between wins over the auto-move.
      await sql`UPDATE loads SET status = ${next} WHERE id = ${r.id} AND status = ${r.status}`
    }
  }
}

/* ---------- Invoicing / AR ---------- */

/** Server-side capability gate for actions — the UI already hides gated features, but
 * a dispatcher could still POST an action directly, so the mutating ones re-check. */
async function assertCan(key: CapabilityKey): Promise<{ error: string } | null> {
  const user = await getCurrentUser()
  if (!(await can(user, key))) return { error: t(await getLocale(), 'actions.noAccess') }
  return null
}

export async function generateInvoice(
  loadId: number,
): Promise<{ docId: number; invoiceNumber: string } | { error: string }> {
  const denied = await assertCan('finances')
  if (denied) return denied
  const load = await getLoad(await companyScope(), loadId)
  if (!load) return { error: t(await getLocale(), 'actions.loadNotFound') }
  const res = await buildInvoicePacket(load)
  if ('error' in res) return res
  revalidatePath(`/loads/${loadId}`)
  revalidatePath('/invoices')
  revalidatePath('/')
  return res
}

export async function markPaid(loadId: number, paid: boolean): Promise<{ error: string } | void> {
  const denied = await assertCan('finances')
  if (denied) return denied
  await sql`UPDATE loads SET paid_at = ${paid ? new Date().toISOString() : null},
            status = ${paid ? 'paid' : 'delivered'} WHERE id = ${loadId} AND company_id = ${await companyScope()}`
  revalidatePath(`/loads/${loadId}`)
  revalidatePath('/invoices')
  revalidatePath('/')
}

/** The company profile is one global record, not per-tenant (it's printed on every
 * real invoice) — so unlike everything else in this file, capability alone isn't
 * enough here: the demo account is blocked outright, whatever its capabilities say,
 * so a public demo visitor can never overwrite the real business's invoice letterhead. */
export async function saveCompany(c: Company): Promise<{ error: string } | void> {
  const denied = await assertCan('finances')
  if (denied) return denied
  const locale = await getLocale()
  if ((await companyScope()) === 'demo') return { error: t(locale, 'actions.demoReadOnly') }
  if (!c.name.trim() || !c.mcdot.trim()) return { error: t(locale, 'actions.needNameAndMcDot') }
  await Promise.all([
    setSetting('co_name', c.name.trim()),
    setSetting('co_owner', c.owner.trim()),
    setSetting('co_mcdot', c.mcdot.trim()),
    setSetting('co_address', c.address.trim()),
    setSetting('co_email', c.email.trim()),
    setSetting('co_phone', c.phone.trim()),
    setSetting('co_remit_to', c.remitTo.trim()),
  ])
  revalidatePath('/invoices')
  revalidatePath('/trucks')
}

export type NewLoad = QrLoad & { source: 'manual' | 'qr'; truckId: number }

/**
 * Deadhead — empty miles from wherever the truck sits right now to this load's
 * pickup city — is the one thing no document can ever print (see qr-load.ts). If
 * the caller didn't already supply it, compute it from the truck's live GPS
 * (fleet_status, joined by unit number) via the same road-routing used everywhere
 * else. No GPS yet, or no pickup city → leave it as given (usually 0, dispatcher
 * fixes it by hand same as always).
 */
async function fillDeadhead(
  companyId: 'default' | 'demo',
  truckId: number,
  deadheadMiles: number,
  origin: string | null,
): Promise<number> {
  if (deadheadMiles > 0 || !origin) return deadheadMiles
  const rows = (await sql`
    SELECT fs.lat, fs.lng FROM trucks t
    LEFT JOIN fleet_status fs ON fs.unit = t.number
    WHERE t.id = ${truckId} AND t.company_id = ${companyId}`) as {
    lat: number | null
    lng: number | null
  }[]
  const t = rows[0]
  if (t?.lat == null || t?.lng == null) return deadheadMiles
  const { deliveryInfo } = await import('@/lib/geo-routing')
  const d = await deliveryInfo({ lat: t.lat, lng: t.lng }, origin)
  return d ? d.miles : deadheadMiles
}

/** С какого порожнего пробега диспетчер получает предупреждение после рейт-кона. */
const DEADHEAD_WARN_MI = 150

export type DeadheadCheck = {
  miles: number
  /** Откуда считали: от выгрузки груза, который трак уже везёт, или от GPS. */
  from: 'load' | 'gps'
  fromLabel: string | null
  toLabel: string | null
  /** Дорогу построить не удалось — прямая с надбавкой. */
  estimated: boolean
  warn: boolean
}

/**
 * Порожний пробег до пикапа нового груза — по дороге и от правильной точки. Если трак
 * уже везёт другой груз, считаем от его выгрузки (последней остановки): оттуда он и
 * поедет пустым к новому пикапу. Иначе — от места трака по GPS. Раньше брался только
 * GPS, и у груза, заведённого наперёд, порожний выходил «от середины текущего рейса».
 */
async function deadheadCheck(
  companyId: 'default' | 'demo',
  truckId: number,
  excludeLoadId: number | null,
  pickupAddress: string | null,
  origin: string | null,
): Promise<DeadheadCheck | null> {
  if (!origin && !pickupAddress) return null
  const { cityCoordsBest, routeToPoint } = await import('@/lib/geo-routing')
  const to = await cityCoordsBest(pickupAddress, origin)
  if (!to) return null
  const prev = (await sql`
    SELECT delivery_address, destination, stops FROM loads
    WHERE company_id = ${companyId} AND truck_id = ${truckId}
      AND status IN ('booked', 'in_transit') AND partial = false
      AND id <> ${excludeLoadId ?? 0}
    ORDER BY delivery_date DESC NULLS LAST, created_at DESC
    LIMIT 1`) as {
    delivery_address: string | null
    destination: string | null
    stops: { address: string | null; city: string | null }[] | string | null
  }[]
  let from: { lat: number; lng: number } | null = null
  let kind: 'load' | 'gps' = 'gps'
  let fromLabel: string | null = null
  if (prev[0]) {
    const st = typeof prev[0].stops === 'string' ? JSON.parse(prev[0].stops) : prev[0].stops
    const end = st?.length ? st[st.length - 1] : null
    const city = end?.city ?? prev[0].destination
    from = await cityCoordsBest(end?.address ?? prev[0].delivery_address, city)
    kind = 'load'
    fromLabel = city ?? null
  }
  if (!from) {
    const rows = (await sql`
      SELECT fs.lat, fs.lng, fs.location FROM trucks t
      LEFT JOIN fleet_status fs ON fs.unit = t.number
      WHERE t.id = ${truckId} AND t.company_id = ${companyId}`) as {
      lat: number | null
      lng: number | null
      location: string | null
    }[]
    const g = rows[0]
    if (g?.lat == null || g?.lng == null) return null
    from = { lat: g.lat, lng: g.lng }
    kind = 'gps'
    fromLabel = g.location
  }
  const leg = await routeToPoint(from, to)
  if (!leg) return null
  return {
    miles: leg.miles,
    from: kind,
    fromLabel,
    toLabel: origin ?? pickupAddress,
    estimated: !!leg.estimated,
    warn: leg.miles > DEADHEAD_WARN_MI,
  }
}

export async function createLoad(
  load: NewLoad,
  /** Pre-uploaded document (the imported RC) that becomes this load's paperwork. */
  docId?: number,
  /** The "Driver Information" block already rendered from the AI read (LoadForm's
   * /import path) — null for a manual/QR entry, which has nothing to render. */
  driverInfo?: string,
): Promise<{ error: string } | void> {
  const ro = await demoReadOnly()
  if (ro) return ro
  let id: number
  const locale = await getLocale()
  try {
    const companyId = await companyScope()
    if (!(await truckBelongs(companyId, load.truckId))) return { error: t(locale, 'actions.truckNotFound') }
    const deadheadMiles = await fillDeadhead(companyId, load.truckId, load.deadheadMiles, load.origin)
    // MC в документе есть не всегда, но если этот брокер уже возил у нас — он у нас
    // уже есть. Иначе тот же брокер снова заводится «без MC», и справочник пустеет
    // ровно там, где по нему и работают.
    const brokerMc = load.brokerMc || (await knownBrokerMc(companyId, load.brokerName, load.brokerEmail))
    // Auto-credited to whoever's actually signed in and clicking "create" — no
    // manual assignment step, feeds the weekly per-dispatcher report on Финансы.
    const dispatcherId = (await getCurrentUser())?.id ?? null
    const rows = await sql`
      INSERT INTO loads (rate, loaded_miles, deadhead_miles, transit_days, origin,
                         destination, truck_location, spot_rpm, broker_name, broker_mc, broker_email,
                         broker_phone, reference_id, source, truck_id, pickup_date,
                         delivery_date, broker_notes, pickup_time, delivery_time,
                         pickup_address, delivery_address, dispatcher_id, company_id, driver_info, pay_via)
      VALUES (${load.rate}, ${load.loadedMiles}, ${deadheadMiles}, ${load.transitDays},
              ${load.origin}, ${load.destination}, ${load.truckLocation}, ${load.spotRpm},
              ${load.brokerName}, ${brokerMc}, ${load.brokerEmail}, ${load.brokerPhone}, ${load.referenceId},
              ${load.source}, ${load.truckId}, ${load.pickupDate ?? null},
              ${load.deliveryDate ?? null}, ${load.brokerNotes ?? null},
              ${load.pickupTime ?? null}, ${load.deliveryTime ?? null},
              ${load.pickupAddress ?? null}, ${load.deliveryAddress ?? null}, ${dispatcherId}, ${companyId},
              ${await driverInfoWithCities(driverInfo)}, ${load.payVia ?? null})
      RETURNING id`
    id = (rows[0] as { id: number }).id
    if (docId && (await docBelongs(companyId, docId))) {
      await sql`UPDATE documents SET load_id = ${id} WHERE id = ${docId} AND load_id IS NULL`
    }
  } catch (e) {
    return { error: humanError(e, locale) }
  }

  revalidatePath('/loads')
  revalidatePath('/')
  revalidatePath(`/trucks/${load.truckId}`)
  revalidatePath('/trucks')
  // Outside the try: redirect() signals by throwing, and a catch would swallow it.
  redirect(`/loads/${id}`)
}

/**
 * Create a load from a parsed rate con WITHOUT redirecting — the truck page stays
 * put and shows the result inline. Attaches the already-uploaded RC document.
 */
const onlyDigits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')

/** Drop a broker MC that is actually OUR OWN. Every rate con names two carriers-ish
 * parties, and our MC is the one we can identify with certainty — it's on the company
 * card (settings co_mcdot, free text like "MC 626911 · DOT 1708530"). Returning null
 * costs a broker lookup; returning our own number costs the dispatcher their trust in
 * the check, since it reports "no broker authority" for a company that never had any. */
/** Fills a missing origin/destination from the stop's ZIP.
 *
 * The reader gives us a street and a ZIP but sometimes no city — the rate con printed
 * the address as one run of text and the split went wrong. Without a city the load is
 * refused outright, which throws away a document that was read correctly in every other
 * respect. A US ZIP names exactly one place, so it is enough to recover.
 *
 * Only ever FILLS a gap: a city the reader did give us is never overwritten, because it
 * came from the document itself and the ZIP lookup is an inference. */
async function fillCitiesFromZip(load: QrLoad): Promise<QrLoad> {
  // Индекс проверяет город ВСЕГДА, а не только когда города нет: брокеры печатают
  // «Ninety Six, NC» при индексе Южной Каролины и «Macadonia» вместо Macedonia.
  // Индекс называет ровно одно место — при расхождении верим ему (lib/city-fix.ts).
  const { zipOf, pickCity } = await import('@/lib/city-fix')
  const { zipPlace } = await import('@/lib/geo-routing')
  const oz = zipOf(load.pickupAddress)
  const dz = zipOf(load.deliveryAddress)
  const [o, d] = await Promise.all([oz ? zipPlace(oz) : null, dz ? zipPlace(dz) : null])
  return {
    ...load,
    origin: pickCity(load.origin, o),
    destination: pickCity(load.destination, d),
  }
}

/** То же для списка остановок: у каждой город сверяется с её индексом. */
async function fillStopCitiesFromZip(stops: LoadStop[] | undefined): Promise<LoadStop[] | undefined> {
  if (!stops?.length) return stops
  const { zipOf, pickCity } = await import('@/lib/city-fix')
  const { zipPlace } = await import('@/lib/geo-routing')
  const out: LoadStop[] = []
  for (const s of stops) {
    const z = zipOf(s.address)
    out.push({ ...s, city: pickCity(s.city, z ? await zipPlace(z) : null) })
  }
  return out
}

/**
 * Дописать город и штат в тексте для водителя там, где рейт-кон напечатал один
 * индекс. «157 Starpointe Boulevard / 15021» — это не адрес: по нему не доехать и
 * его не вбить в навигатор. Индекс называет ровно одно место, поэтому город берётся
 * из него; сам индекс остаётся, чтобы сверять с бумагой.
 */
async function driverInfoWithCities(text: string | null | undefined): Promise<string | null> {
  if (!text) return text ?? null
  const { lonelyZips, withCities } = await import('@/lib/driver-info-zip')
  const zips = lonelyZips(text)
  if (zips.length === 0) return text
  const { zipPlace } = await import('@/lib/geo-routing')
  const places: Record<string, string> = {}
  await Promise.all(
    zips.map(async (z) => {
      const p = await zipPlace(z).catch(() => null)
      if (p) places[z] = p
    }),
  )
  return withCities(text, places)
}

async function withoutOwnMc(load: QrLoad): Promise<QrLoad> {
  if (!load.brokerMc) return load
  const { getCompany } = await import('@/lib/invoice')
  const mine = onlyDigits(/\bMC\s*#?\s*[:\-]?\s*(\d{5,8})\b/i.exec((await getCompany()).mcdot)?.[1])
  return mine && onlyDigits(load.brokerMc) === mine ? { ...load, brokerMc: null } : load
}

/** Что вернул разбор рейт-кона: новый груз или дополненный существующий. */
export type RcCreateResult = {
  loadId: number
  /** Груз с таким номером уже был (второй файл той же пары) — данные дополнены. */
  merged?: boolean
  /** Что именно дополнили: 'rate' | 'addresses' | 'contacts' | 'driverInfo' | 'notes' | 'miles'. */
  filled?: string[]
  /** Чего в грузе всё ещё нет — подсказка «загрузи второй файл». */
  missing?: 'rate' | 'driverinfo' | null
  /** Порожний пробег до пикапа по дороге — для предупреждения больше 150 миль. */
  deadhead?: DeadheadCheck | null
}

/**
 * Груз с тем же номером брокера, созданный недавно: TQL и другие присылают рейт-кон
 * и Driver Info ОТДЕЛЬНЫМИ файлами с одним PO#, и второй файл должен дополнять
 * первый, а не плодить дубль. Свой трак — в приоритете, но груз мог завести и
 * коллега на другой карточке.
 */
/**
 * Тот же номер PO уже заведён на ДРУГОМ траке. Раньше такой рейт-кон молча
 * приклеивался к чужому грузу (поиск смотрел все траки), груз этого трака не
 * создавался, а брошенный по ошибке файл портил чужую карточку. Теперь дописывание
 * — только в свой трак, а чужой груз — отказ с объяснением, где он.
 */
async function findLoadOnOtherTruck(companyId: string, truckId: number, ref: string | null | undefined) {
  const key = (ref ?? '').replace(/[^0-9a-z]/gi, '').toUpperCase()
  if (key.length < 5) return null
  const rows = (await sql`
    SELECT l.id, l.reference_id, t.number, t.driver_name FROM loads l
    JOIN trucks t ON t.id = l.truck_id
    WHERE l.company_id = ${companyId} AND l.truck_id <> ${truckId}
      AND l.status NOT IN ('cancelled', 'paid')
      AND l.created_at > now() - interval '45 days'
      AND upper(regexp_replace(COALESCE(l.reference_id, ''), '[^0-9A-Za-z]', '', 'g')) = ${key}
    ORDER BY l.created_at DESC
    LIMIT 1`) as { id: number; reference_id: string | null; number: string | null; driver_name: string | null }[]
  return rows[0] ?? null
}

async function findLoadByReference(companyId: string, truckId: number, ref: string | null | undefined) {
  const key = (ref ?? '').replace(/[^0-9a-z]/gi, '').toUpperCase()
  if (key.length < 5) return null
  const rows = (await sql`
    SELECT id, truck_id, origin, destination, rate, loaded_miles, deadhead_miles, miles_estimated, pickup_address, delivery_address,
           pickup_time, delivery_time, pickup_date, delivery_date, broker_name, broker_mc,
           broker_phone, broker_email, broker_notes, driver_info, pay_via, stops
    FROM loads
    WHERE company_id = ${companyId}
      AND status NOT IN ('cancelled', 'paid')
      AND created_at > now() - interval '45 days'
      AND upper(regexp_replace(COALESCE(reference_id, ''), '[^0-9A-Za-z]', '', 'g')) = ${key}
      AND truck_id = ${truckId}
    ORDER BY created_at DESC
    LIMIT 1`) as {
    id: number
    truck_id: number | null
    origin: string | null
    destination: string | null
    rate: number
    loaded_miles: number
    deadhead_miles: number
    miles_estimated: boolean
    pickup_address: string | null
    delivery_address: string | null
    pickup_time: string | null
    delivery_time: string | null
    pickup_date: string | null
    delivery_date: string | null
    broker_name: string | null
    broker_mc: string | null
    broker_phone: string | null
    broker_email: string | null
    broker_notes: string | null
    driver_info: string | null
    pay_via: string | null
    stops: LoadStop[] | null
  }[]
  return rows[0] ?? null
}

export async function createLoadFromRc(
  truckId: number,
  load: QrLoad,
  docId?: number,
  /** The "Driver Information" block rendered from the same AI read that produced
   * `load` — stored so it can be re-copied from the load page later, not just once
   * in the browser session right after the RC was read. */
  driverInfo?: string,
  /** Все остановки рейса из того же чтения (lib/stops.ts); две и меньше — обычный груз. */
  stops?: LoadStop[],
): Promise<RcCreateResult | { error: string; elsewhereLoadId?: number }> {
  const ro = await demoReadOnly()
  if (ro) return ro
  const locale = await getLocale()
  try {
    const companyId = await companyScope()
    if (!(await truckBelongs(companyId, truckId))) return { error: t(locale, 'actions.truckNotFound') }
    stops = await fillStopCitiesFromZip(stops)
    const stopsJson = stops && stops.length > 2 ? JSON.stringify(stops) : null
    // A rate con prints TWO MC numbers — the broker's and ours, as the carrier being
    // hired — and whichever the reader grabbed first used to land in broker_mc. That
    // pointed the FMCSA check at our own company and reported "broker authority NONE",
    // which is true of every carrier alive and says nothing about the broker.
    // The AI is now told which one to take (lib/ratecon-ai-contract.ts), but the regex
    // fallback still can't tell them apart, so refuse the one number we can always
    // recognise: our own. Better an empty broker MC than a confident wrong one.
    load = await withoutOwnMc(load)
    // A load with no origin/destination cannot be mapped, cannot be routed, and so
    // cannot have its mileage computed — it just gets refused. Some rate cons print each
    // stop as one run of text and the reader comes back with a street and a ZIP but no
    // city (measured on Corporate Traffic #11694630: street "909 MAGNOLIA AVENUE", zip
    // "33823", city empty). A US ZIP names exactly one place, so recover the city from
    // it rather than throwing away a document that was read correctly otherwise.
    load = await fillCitiesFromZip(load)

    // Второй файл той же пары (тот же PO#) — дополняем уже созданный груз тем, чего в
    // нём нет: ставкой из рейт-кона, адресами и контактами из листа водителя.
    const twin = await findLoadByReference(companyId, truckId, load.referenceId)
    if (!twin) {
      const other = await findLoadOnOtherTruck(companyId, truckId, load.referenceId)
      if (other) {
        // Файл — в корзину: иначе он повиснет у этого трака «рейт-коном без груза» и
        // позовёт создать дубль. Из корзины его можно вернуть.
        if (docId && (await docBelongs(companyId, docId)))
          await sql`UPDATE documents SET deleted_at = now() WHERE id = ${docId} AND load_id IS NULL`
        const truckName = [other.number ? `TRK-${other.number}` : null, other.driver_name].filter(Boolean).join(' · ')
        revalidatePath(`/trucks/${truckId}`)
        return {
          error: t(locale, 'actions.rcElsewhere')
            .replace('{ref}', other.reference_id ?? '')
            .replace('{truck}', truckName || '—'),
          elsewhereLoadId: other.id,
        }
      }
    }
    if (twin) {
      const filled: string[] = []
      const nz = (v: string | null | undefined) => (v && v.trim() ? v : null)
      const rate = twin.rate > 0 ? twin.rate : load.rate > 0 ? (filled.push('rate'), load.rate) : twin.rate
      const pickupAddress =
        nz(twin.pickup_address) ?? (nz(load.pickupAddress) ? (filled.push('addresses'), load.pickupAddress) : null)
      const deliveryAddress = nz(twin.delivery_address) ?? nz(load.deliveryAddress) ?? null
      const brokerPhone =
        nz(twin.broker_phone) ?? (nz(load.brokerPhone) ? (filled.push('contacts'), load.brokerPhone) : null)
      const brokerEmail = nz(twin.broker_email) ?? nz(load.brokerEmail) ?? null
      const brokerName = nz(twin.broker_name) ?? nz(load.brokerName) ?? null
      const brokerMc = nz(twin.broker_mc) ?? nz(load.brokerMc) ?? null
      const notes = nz(twin.broker_notes) ?? (nz(load.brokerNotes) ? (filled.push('notes'), load.brokerNotes) : null)
      // Текст водителю: побеждает тот, где есть улицы и названия складов (лист
      // водителя), даже если у груза уже был текст из рейт-кона с одним «Город, ST».
      const { hasStreets } = await import('@/lib/driver-info-zip')
      // Файл принёс остановки, которых у груза не было, — его текст водителю полнее
      // (по блоку на каждую точку), берём его.
      const stopsFilled = !twin.stops?.length && !!stopsJson
      const info =
        nz(driverInfo) && (stopsFilled || (hasStreets(driverInfo) && !hasStreets(twin.driver_info)))
          ? (filled.push('driverInfo'), await driverInfoWithCities(driverInfo))
          : (nz(twin.driver_info) ??
            (nz(driverInfo) ? (filled.push('driverInfo'), await driverInfoWithCities(driverInfo)) : null))
      // Город: у файла с индексом (лист водителя) он выверен по индексу, у первого
      // файла мог остаться с опечаткой брокера («Anahiem») — заменяем.
      const { zipOf } = await import('@/lib/city-fix')
      const origin = zipOf(load.pickupAddress) && nz(load.origin) ? load.origin : twin.origin
      const destination = zipOf(load.deliveryAddress) && nz(load.destination) ? load.destination : twin.destination
      const citiesChanged = origin !== twin.origin || destination !== twin.destination
      if (citiesChanged) filled.push('cities')
      // Остановки: у груза их ещё нет, а этот файл принёс три и больше — дописываем
      // и пересчитываем мили через все точки.
      if (stopsFilled) filled.push('stops')
      // Мили. У первого груза они могли быть посчитаны по опечатке («Anahiem» → точка
      // в Оклахоме → 1075 mi вместо 290) и при этом НЕ помечены как оценка: геокодер
      // «нашёл». Поэтому пересчитываем всякий раз, когда второй файл улучшил вводные —
      // исправил город или принёс адреса с индексами; иначе оставляем как есть.
      let miles = twin.loaded_miles
      let milesEstimated = twin.miles_estimated
      // Файл с индексами обоих складов — лучший источник маршрута; повторный сброс
      // такого файла чинит мили и у уже сшитого груза.
      const hasZips = !!(zipOf(load.pickupAddress) && zipOf(load.deliveryAddress))
      if (load.loadedMiles > 0 && (twin.miles_estimated || citiesChanged)) {
        miles = load.loadedMiles
        milesEstimated = false
        filled.push('miles')
      } else if ((citiesChanged || hasZips || twin.miles_estimated || stopsFilled) && origin && destination) {
        const { routeMiles, routeMilesVia } = await import('@/lib/geo-routing')
        const r = stopsFilled
          ? await routeMilesVia(stops!, locale)
          : await routeMiles(origin, destination, locale, {
              origin: pickupAddress ?? load.pickupAddress,
              destination: deliveryAddress ?? load.deliveryAddress,
            })
        if ('miles' in r && r.miles > 0 && r.miles !== twin.loaded_miles && (!r.estimated || twin.miles_estimated)) {
          miles = r.miles
          milesEstimated = !!r.estimated
          filled.push('miles')
        }
      }
      // Порожний пробег считался до старого (неверного) пикапа — тоже заново.
      const deadhead = filled.includes('miles')
        ? await fillDeadhead(companyId, truckId, 0, origin)
        : twin.deadhead_miles
      await sql`
        UPDATE loads SET
          origin = ${origin}, destination = ${destination},
          rate = ${rate}, loaded_miles = ${miles}, miles_estimated = ${milesEstimated}, deadhead_miles = ${deadhead},
          pickup_address = ${pickupAddress}, delivery_address = ${deliveryAddress},
          pickup_time = COALESCE(pickup_time, ${load.pickupTime ?? null}),
          delivery_time = COALESCE(delivery_time, ${load.deliveryTime ?? null}),
          pickup_date = COALESCE(pickup_date, ${load.pickupDate ?? null}),
          delivery_date = COALESCE(delivery_date, ${load.deliveryDate ?? null}),
          broker_name = ${brokerName}, broker_mc = ${brokerMc}, broker_phone = ${brokerPhone}, broker_email = ${brokerEmail},
          broker_notes = ${notes}, driver_info = ${info}, pay_via = COALESCE(pay_via, ${load.payVia ?? null}),
          stops = COALESCE(stops, ${stopsJson}::jsonb)
        WHERE id = ${twin.id} AND company_id = ${companyId}`
      // Файл — к этому же грузу, со своим типом (лист водителя остаётся листом).
      if (docId && (await docBelongs(companyId, docId)))
        await sql`UPDATE documents SET load_id = ${twin.id} WHERE id = ${docId} AND load_id IS NULL`
      revalidatePath(`/loads/${twin.id}`)
      revalidatePath(`/trucks/${truckId}`)
      revalidatePath('/loads')
      revalidatePath('/')
      const dh = await deadheadCheck(companyId, truckId, twin.id, pickupAddress ?? load.pickupAddress ?? null, origin)
      return {
        loadId: twin.id,
        merged: true,
        deadhead: dh,
        filled,
        missing: rate > 0 ? (pickupAddress || deliveryAddress ? null : 'driverinfo') : 'rate',
      }
    }

    // Plenty of real rate cons never print a mileage figure. loads.loaded_miles has
    // CHECK (> 0), so those used to die on a raw constraint violation — the load
    // silently never appeared. Fall back to actual road miles between the two cities
    // (same OSRM routing the map uses). Every RC path funnels through here, so this
    // one guard covers the truck-page drop, /import and the new-load scanner alike.
    let loadedMiles = load.loadedMiles
    let milesEstimated = false
    // Три и больше точек: мили через все, не напрямую от первой к последней, даже
    // если рейт-кон напечатал свои — те обычно и есть прямые.
    if (stopsJson && load.origin && load.destination) {
      const { routeMilesVia } = await import('@/lib/geo-routing')
      const r = await routeMilesVia(stops!, locale)
      if ('miles' in r && r.miles > 0 && !r.estimated) loadedMiles = r.miles
    }
    if (!(loadedMiles > 0) && load.origin && load.destination) {
      const { routeMiles } = await import('@/lib/geo-routing')
      const r = await routeMiles(load.origin, load.destination, locale, {
        origin: load.pickupAddress,
        destination: load.deliveryAddress,
      })
      if ('miles' in r) {
        loadedMiles = r.miles
        milesEstimated = !!r.estimated
      }
    }
    // Пробег не найден вовсе — груз всё равно создаём, с пометкой: диспетчер впишет
    // мили в «Деталях». Отказ означал потерянный рейс и звонок «ничего не работает».
    if (!(loadedMiles > 0)) {
      loadedMiles = 1
      milesEstimated = true
    }
    // Порожний — по дороге и от правильной точки (deadheadCheck); напечатанный в
    // документе, если он там есть, важнее.
    const dh = await deadheadCheck(companyId, truckId, null, load.pickupAddress ?? null, load.origin)
    const deadheadMiles = load.deadheadMiles > 0 ? load.deadheadMiles : (dh?.miles ?? load.deadheadMiles)
    // Тот же добор MC, что и при ручном заведении: рейт-кон о нём обычно молчит.
    const brokerMc = load.brokerMc || (await knownBrokerMc(companyId, load.brokerName, load.brokerEmail))
    // Auto-credited to whoever's actually signed in and dropping the RC — no manual
    // assignment step, feeds the weekly per-dispatcher report on Финансы.
    const dispatcherId = (await getCurrentUser())?.id ?? null

    // A rate confirmation IS a confirmed booking — there's nothing left to "quote".
    // Defaulting to the schema's 'quoted' here meant every RC-sourced load needed a
    // manual status click before it counted as the truck's current assignment, so
    // the map and "Текущее задание" looked stuck even though the load was real.
    const rows = await sql`
      INSERT INTO loads (rate, loaded_miles, deadhead_miles, transit_days, origin,
                         destination, truck_location, spot_rpm, broker_name, broker_mc, broker_email,
                         broker_phone, reference_id, source, truck_id, pickup_date,
                         delivery_date, broker_notes, pickup_time, delivery_time,
                         pickup_address, delivery_address, status, dispatcher_id, company_id, driver_info, pay_via, miles_estimated, stops)
      VALUES (${load.rate}, ${loadedMiles}, ${deadheadMiles}, ${load.transitDays},
              ${load.origin}, ${load.destination}, ${load.truckLocation}, ${load.spotRpm},
              ${load.brokerName}, ${brokerMc}, ${load.brokerEmail}, ${load.brokerPhone}, ${load.referenceId},
              'qr', ${truckId}, ${load.pickupDate ?? null}, ${load.deliveryDate ?? null},
              ${load.brokerNotes ?? null}, ${load.pickupTime ?? null}, ${load.deliveryTime ?? null},
              ${load.pickupAddress ?? null}, ${load.deliveryAddress ?? null}, 'booked', ${dispatcherId}, ${companyId},
              ${await driverInfoWithCities(driverInfo)}, ${load.payVia ?? null}, ${milesEstimated}, ${stopsJson}::jsonb)
      RETURNING id`
    const loadId = (rows[0] as { id: number }).id
    if (docId && (await docBelongs(companyId, docId)))
      // kind='ratecon' too: if this doc was recognised out of a misclassified Telegram
      // file, label it correctly now that we know what it is.
      // «Другое» из Telegram становится рейт-коном; лист водителя своим типом и остаётся.
      await sql`UPDATE documents SET load_id = ${loadId}, kind = CASE WHEN kind = 'other' THEN 'ratecon' ELSE kind END
                WHERE id = ${docId} AND load_id IS NULL`
    revalidatePath(`/trucks/${truckId}`)
    revalidatePath('/loads')
    revalidatePath('/')
    return {
      loadId,
      deadhead: dh,
      // Чего не хватает: без ставки — это был лист водителя, нужен рейт-кон; без адресов
      // складов — это был рейт-кон, пригодится Driver Info.
      missing: load.rate > 0 ? (load.pickupAddress || load.deliveryAddress ? null : 'driverinfo') : 'rate',
    }
  } catch (e) {
    return { error: humanError(e, locale) }
  }
}

/**
 * Turn an ALREADY-UPLOADED rate con into a load, entirely server-side.
 *
 * The browser-orchestrated path (upload → AI → create, in TruckRcDrop) leaves a
 * stranded document if the page is reloaded during the AI read — which on a scanned
 * PDF takes over a minute, long enough to look frozen. This runs the whole thing in
 * one server action, so nothing is lost to a navigation, and it rescues documents
 * already stranded that way.
 */
export async function createLoadFromExistingRc(
  docId: number,
  truckId: number,
): Promise<{ loadId: number } | { error: string }> {
  const companyId = await companyScope()
  const locale = await getLocale()
  // Postgres' encode() wraps base64 at PEM width; Gemini's inlineData rejects the
  // embedded newlines with a 400, hence the replace().
  // No kind filter: a rate con that arrived via Telegram may have been auto-classified
  // as 'other' (a scan the classifier misread), and the whole point of "recognise from
  // the truck's files" is to rescue exactly that case. Clicking recognise asserts it's a
  // rate con; if the AI can't read one out of it, geminiExtract errors cleanly below.
  const rows = await sql`
    SELECT replace(encode(data, 'base64'), E'\n', '') AS b64, mime, load_id
    FROM documents WHERE id = ${docId} AND company_id = ${companyId}`
  const doc = rows[0] as { b64: string; mime: string; load_id: number | null } | undefined
  if (!doc) return { error: t(locale, 'actions.rateconNotFound') }
  if (doc.load_id) return { error: t(locale, 'actions.rateconAlreadyUsed') }

  const { geminiExtract } = await import('@/lib/ratecon-gemini')
  const res = await geminiExtract({ pdfBase64: doc.b64, mime: doc.mime })
  if ('error' in res)
    return {
      error:
        res.error === 'no_key'
          ? t(locale, 'actions.aiUnavailable')
          : `${t(locale, 'actions.aiFailedToRead')} ${res.error}`,
    }

  const { aiToFields } = await import('@/lib/ratecon-ai-contract')
  const fields = aiToFields(res.fields, res.model)
  return createLoadFromRc(truckId, toQrLoad(fields), docId, formatDriverInfo(fields), fields.stops)
}

/** Status can also be set here (not just via markPaid's "Отметить оплаченным"
 * button) — 'paid' and 'delivered' must still keep paid_at in sync either way, or a
 * load can end up "paid" by status but invisible on the AR page's Оплачено tab
 * (which goes by paid_at), exactly the split state that happened before this. */
/** Which of the two delivery documents a load already has. */
async function deliveryDocs(loadId: number): Promise<{ bol: boolean; pod: boolean }> {
  const rows = (await sql`
    SELECT DISTINCT kind FROM documents WHERE load_id = ${loadId} AND kind IN ('bol', 'pod')`) as {
    kind: string
  }[]
  const kinds = new Set(rows.map((r) => r.kind))
  return { bol: kinds.has('bol'), pod: kinds.has('pod') }
}

export async function setStatus(id: number, status: LoadStatus): Promise<{ error: string } | void> {
  const ro = await demoReadOnly()
  if (ro) return ro
  // «Доставлен» больше НЕ требует бумаг. Груз доставлен в тот момент, когда водитель
  // его сдал, — а POD приходит фотографией через час-два, и всё это время статус врал.
  // Вместо запрета на странице груза висит постоянный баннер о недостающих BOL/POD
  // (components/missing-docs-banner.tsx), а список грузов помечает такой груз.
  //
  // «Оплачен» проверку сохраняет: это уже про деньги, и пакет для счёта (lib/invoice.ts)
  // без POD собрать нельзя — там запрет не раздражает, а спасает.
  if (status === 'paid') {
    const d = await deliveryDocs(id)
    if (!d.bol || !d.pod) {
      const missing = [!d.bol ? 'BOL' : null, !d.pod ? 'POD' : null].filter(Boolean).join(' + ')
      return {
        error: t(await getLocale(), 'actions.paidNeedsDocs').replace('{missing}', missing),
      }
    }
  }
  await sql`
    UPDATE loads SET status = ${status},
      paid_at = CASE WHEN ${status} = 'paid' THEN COALESCE(paid_at, now())
                     WHEN paid_at IS NOT NULL THEN NULL
                     ELSE paid_at END
    WHERE id = ${id} AND company_id = ${await companyScope()}`
  revalidatePath(`/loads/${id}`)
  revalidatePath('/loads')
  revalidatePath('/invoices')
  revalidatePath('/')
  revalidatePath('/trucks', 'layout')
}

/** Truck identity (number + driver) plus its economics — everything a truck is. */
export type TruckInput = TruckSettings & { number: string; driverName: string }

/** Пустое поле формы приходит как NaN, а Postgres его молча ПРИНИМАЕТ в numeric —
 * и дальше каждый расчёт по траку показывает «$NaN». Граница доверия — здесь:
 * всё нечисловое становится нулём. */
function finiteTruck(t: TruckInput): TruckInput {
  const n = (v: number) => (Number.isFinite(v) ? v : 0)
  return {
    ...t,
    mpg: n(t.mpg),
    fuelPricePerGallon: n(t.fuelPricePerGallon),
    truckPaymentPerDay: n(t.truckPaymentPerDay),
    insurancePerDay: n(t.insurancePerDay),
    eldPermitsPerDay: n(t.eldPermitsPerDay),
    maintenanceCostPerMile: n(t.maintenanceCostPerMile),
    factoringPercent: n(t.factoringPercent),
    dispatchPercent: n(t.dispatchPercent),
    driverPay:
      t.driverPay.mode === 'cpm'
        ? { mode: 'cpm', centsPerMile: n(t.driverPay.centsPerMile) }
        : { mode: 'percent', percentOfGross: n(t.driverPay.percentOfGross) },
  }
}

export async function saveTruck(id: number, t: TruckInput): Promise<{ error: string } | void> {
  const ro = await demoReadOnly()
  if (ro) return ro
  t = finiteTruck(t)
  const denied = await assertCan('edit_trucks')
  if (denied) return denied
  const cpm = t.driverPay.mode === 'cpm' ? t.driverPay.centsPerMile : null
  const pct = t.driverPay.mode === 'percent' ? t.driverPay.percentOfGross : null
  try {
    await sql`
      UPDATE trucks SET
        number = ${t.number},
        driver_name = ${t.driverName},
        mpg = ${t.mpg},
        fuel_price_per_gallon = ${t.fuelPricePerGallon},
        driver_pay_mode = ${t.driverPay.mode},
        driver_cents_per_mile = ${cpm},
        driver_percent_of_gross = ${pct},
        truck_payment_per_day = ${t.truckPaymentPerDay},
        insurance_per_day = ${t.insurancePerDay},
        eld_permits_per_day = ${t.eldPermitsPerDay},
        maintenance_cost_per_mile = ${t.maintenanceCostPerMile},
        factoring_percent = ${t.factoringPercent},
        dispatch_percent = ${t.dispatchPercent}
      WHERE id = ${id} AND company_id = ${await companyScope()}`
  } catch (e) {
    return { error: humanError(e, await getLocale()) }
  }
  // Blunt on purpose: a truck's settings feed calcLoad on every page that shows its
  // money. Enumerating them is more code, and one forgotten path means silently
  // wrong numbers.
  revalidatePath('/', 'layout')
}

/** Manual availability: 'active' clears the flag, 'repair'/'vacation' set it. An
 * unavailable truck is badged across the app and excluded from "свободно" counts. */
export async function setTruckAvailability(
  truckId: number,
  status: 'active' | 'repair' | 'vacation',
): Promise<{ error: string } | void> {
  const ro = await demoReadOnly()
  if (ro) return ro
  const denied = await assertCan('edit_trucks')
  if (denied) return denied
  if (!(await truckBelongs(await companyScope(), truckId)))
    return { error: t(await getLocale(), 'actions.truckNotFound') }
  await sql`UPDATE trucks SET unavailable = ${status === 'active' ? null : status} WHERE id = ${truckId}`
  revalidatePath('/', 'layout')
}

/* ---------- Documents ---------- */

const MAX_DOC_BYTES = 8 * 1024 * 1024

/** Vision-classify an uploaded document (base64) into a doc kind before deciding what to do
 * with it — so a BOL dropped on the truck card is filed as a BOL, not force-labelled a rate
 * con. Degrades to 'other' with no AI key; never throws. */
export async function classifyDoc(file: File): Promise<DocClass | null> {
  // Аргумент — ФАЙЛ, а не base64-строка. Строкой это ломалось на настоящих
  // рейт-конах: сериализатор сервер-экшенов Next режет длинную строку на вложенные
  // массивы и на ~мегабайте падает с «Maximum array nesting exceeded», а наружу
  // это выходило пугающим «An error occurred in the Server Components render».
  // File едет через FormData как поток — ограничение снимается вместе с причиной.
  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64')
  const mime = file.type || 'application/pdf'
  const filename = file.name
  const { classifyDocument } = await import('@/lib/ai-doc')
  // null — «определить не удалось» (ключ мёртв, кончился дневной лимит). Наверх это
  // уходит как есть: раньше здесь стояло 'other', и файл получал ярлык «Другое», хотя
  // его никто не смотрел. Ярлык врал, а по нему потом искали.
  return classifyDocument(base64, mime, filename)
}

/**
 * FormData: file, kind, title?, truckId?, loadId?, maintenanceId?. Returns the new
 * id so the RC import can attach the document to the load it creates a moment later.
 */
export async function uploadDocument(fd: FormData): Promise<{ id: number } | { error: string }> {
  const ro = await demoReadOnly()
  if (ro) return ro
  const locale = await getLocale()
  const file = fd.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: t(locale, 'actions.noFileSelected') }
  if (file.size > MAX_DOC_BYTES) return { error: t(locale, 'actions.fileOver8mb') }

  const kind = String(fd.get('kind') || 'other')
  const title = String(fd.get('title') || '').trim() || file.name
  const truckId = fd.get('truckId') ? Number(fd.get('truckId')) : null
  const loadId = fd.get('loadId') ? Number(fd.get('loadId')) : null
  const maintenanceId = fd.get('maintenanceId') ? Number(fd.get('maintenanceId')) : null
  // POD промежуточной остановки: номер точки; без него — конечная выгрузка.
  const stopSeq = fd.get('stopSeq') ? Number(fd.get('stopSeq')) : null
  const companyId = await companyScope()
  if (truckId && !(await truckBelongs(companyId, truckId))) return { error: t(locale, 'actions.truckNotFound') }
  if (loadId && !(await loadBelongs(companyId, loadId))) return { error: t(locale, 'actions.loadNotFound') }
  // Hex round-trip: Neon's HTTP driver JSON-encodes params, raw bytes don't survive.
  const hex = Buffer.from(await file.arrayBuffer()).toString('hex')

  try {
    const rows = await sql`
      INSERT INTO documents (truck_id, load_id, maintenance_id, kind, title, mime, size_bytes, data, company_id, stop_seq)
      VALUES (${truckId}, ${loadId}, ${maintenanceId}, ${kind}, ${title},
              ${file.type || 'application/octet-stream'}, ${file.size}, decode(${hex}, 'hex'), ${companyId}, ${stopSeq})
      RETURNING id`
    revalidatePath('/docs')
    if (truckId) revalidatePath(`/trucks/${truckId}`)
    if (loadId) revalidatePath(`/loads/${loadId}`)
    // A dispatcher only ever has POD/BOL/rate con, never an "invoice" of their own —
    // the invoice is generated FROM the POD, so once it lands there's no manual step.
    // Инвойс собирается по КОНЕЧНОМУ POD; POD промежуточной точки его не запускает.
    if (loadId && kind === 'pod' && stopSeq == null) await autoInvoiceIfReady(companyId, loadId)
    return { id: (rows[0] as { id: number }).id }
  } catch (e) {
    return { error: humanError(e, locale) }
  }
}

/** Тип документа называет человек: «BOL» на самом деле оказался фото груза, страница
 * POD ушла как «Прочее». Меняем подпись, файл на месте. */
/** Отметки водителя правит диспетчер: водитель мог нажать кнопку не вовремя или
 * забыть нажать вовсе, а от этих времён считается детеншен. */
export async function removeLoadEvent(id: number): Promise<{ error: string } | void> {
  const ro = await demoReadOnly()
  if (ro) return ro
  const companyId = await companyScope()
  const { deleteLoadEvent } = await import('@/lib/load-events')
  const loadId = await deleteLoadEvent(companyId, id)
  if (loadId) revalidatePath(`/loads/${loadId}`)
}

export async function setLoadEventTime(id: number, atIso: string): Promise<{ error: string } | void> {
  const ro = await demoReadOnly()
  if (ro) return ro
  const when = new Date(atIso)
  if (Number.isNaN(when.getTime())) return { error: 'bad date' }
  const companyId = await companyScope()
  const { updateLoadEventAt } = await import('@/lib/load-events')
  const loadId = await updateLoadEventAt(companyId, id, when.toISOString())
  if (loadId) revalidatePath(`/loads/${loadId}`)
}

export async function addLoadEventManual(
  loadId: number,
  kind: string,
  atIso: string,
  note?: string,
  /** Какой остановки касается (lib/stops.ts); без номера — концы рейса. */
  stopSeq?: number | null,
): Promise<{ error: string } | void> {
  const ro = await demoReadOnly()
  if (ro) return ro
  const allowed = ['arrived_pickup', 'loaded', 'arrived_delivery', 'delivered', 'note']
  if (!allowed.includes(kind)) return { error: 'bad kind' }
  const when = new Date(atIso)
  if (Number.isNaN(when.getTime())) return { error: 'bad date' }
  const companyId = await companyScope()
  if (!(await loadBelongs(companyId, loadId))) return { error: 'load' }
  const rows = (await sql`SELECT truck_id FROM loads WHERE id = ${loadId}`) as {
    truck_id: number | null
  }[]
  await sql`INSERT INTO load_events (company_id, load_id, truck_id, kind, note, at, stop_seq)
            VALUES (${companyId}, ${loadId}, ${rows[0]?.truck_id ?? null}, ${kind}, ${note?.trim() || null}, ${when.toISOString()}, ${stopSeq ?? null})`
  revalidatePath(`/loads/${loadId}`)
}

/** Снять отметку «загрузился/выгрузился» с промежуточной остановки — откат клика
 * по точке на полосе статусов. Удаляет только отметки с номером этой точки. */
export async function unmarkStop(
  loadId: number,
  stopSeq: number,
  role: 'pickup' | 'delivery',
): Promise<{ error: string } | void> {
  const ro = await demoReadOnly()
  if (ro) return ro
  const companyId = await companyScope()
  if (!(await loadBelongs(companyId, loadId))) return { error: 'load' }
  const kinds = role === 'pickup' ? ['arrived_pickup', 'loaded'] : ['arrived_delivery', 'delivered']
  await sql`DELETE FROM load_events
            WHERE company_id = ${companyId} AND load_id = ${loadId} AND stop_seq = ${stopSeq} AND kind = ANY(${kinds})`
  revalidatePath(`/loads/${loadId}`)
}

export async function setDocumentKind(docId: number, kind: string): Promise<{ error: string } | void> {
  const ro = await demoReadOnly()
  if (ro) return ro
  if (!(kind in DOC_KINDS)) return { error: 'bad kind' }
  const companyId = await companyScope()
  if (!(await docBelongs(companyId, docId))) return
  const rows = await sql`UPDATE documents SET kind = ${kind} WHERE id = ${docId} RETURNING load_id`
  const loadId = (rows[0] as { load_id: number | null } | undefined)?.load_id
  revalidatePath('/docs')
  if (loadId) {
    revalidatePath(`/loads/${loadId}`)
    if (kind === 'pod') await autoInvoiceIfReady(companyId, loadId)
  }
}

/** Постоянная ссылка на страницу водителя этого трака (lib/driver-link.ts). */
export async function getDriverLink(truckId: number): Promise<{ url: string } | { error: string }> {
  const companyId = await companyScope()
  if (companyId === 'demo') return { error: 'demo' }
  if (!(await truckBelongs(companyId, truckId))) return { error: 'truck' }
  const { driverTokenFor } = await import('@/lib/driver-link')
  const token = await driverTokenFor(truckId)
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? ''
  const proto = h.get('x-forwarded-proto') ?? 'https'
  return { url: `${proto}://${host}/d/${token}` }
}

export async function attachDocumentToLoad(docId: number, loadId: number): Promise<void> {
  const ro = await demoReadOnly()
  if (ro) return
  const companyId = await companyScope()
  if (!(await docBelongs(companyId, docId)) || !(await loadBelongs(companyId, loadId))) return
  const rows = await sql`
    UPDATE documents SET load_id = ${loadId} WHERE id = ${docId} AND load_id IS NULL RETURNING kind`
  revalidatePath(`/loads/${loadId}`)
  revalidatePath('/docs')
  if ((rows[0] as { kind: string } | undefined)?.kind === 'pod') await autoInvoiceIfReady(companyId, loadId)
}

/** audit_log/logins have no company column of their own — they're keyed by a free-
 * text "who" name, not a row a company_id filter could attach to. So instead of
 * filtering the real Журнал for demo noise, we simply never write it: a demo
 * session's deletes have no audit value for the real business, and the DEMO
 * companyId check here is what keeps "Демо" out of it entirely. */
async function auditDelete(
  companyId: 'default' | 'demo',
  who: string,
  action: string,
  target: string,
  docKind: string | null,
  fromLoc: string | null,
  toLoc: string | null,
): Promise<void> {
  if (companyId === 'demo') return
  const h = await headers()
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0]!.trim() || null
  const { ipCity } = await import('@/lib/geo-routing')
  const city = await ipCity(ip)
  await sql`
    INSERT INTO audit_log (who, action, target, doc_kind, from_loc, to_loc, ip, user_agent, city)
    VALUES (${who.trim()}, ${action}, ${target}, ${docKind}, ${fromLoc}, ${toLoc}, ${ip}, ${h.get('user-agent')}, ${city})`
}

/**
 * "Deleting" a document only moves it to the trash (deleted_at) — the file itself
 * stays put until purgeDocument removes it for real. Guarded by the signed-in user's
 * own password, audited (who, what, the load route) — shown in the Журнал.
 */
export async function deleteDocument(id: number, confirm: string): Promise<{ error: string } | void> {
  const ro = await demoReadOnly()
  if (ro) return ro
  const locale = await getLocale()
  const check = await confirmDelete(confirm, locale)
  if ('error' in check) return { error: check.error }
  const who = check.user.name || t(locale, 'actions.dispatcherFallback')
  if (!(await docBelongs(check.user.companyId, id))) return { error: t(locale, 'actions.docNotFound') }

  try {
    const rows = (await sql`
      SELECT d.title, d.kind, l.origin, l.destination
      FROM documents d LEFT JOIN loads l ON l.id = d.load_id
      WHERE d.id = ${id} AND d.deleted_at IS NULL`) as {
      title: string
      kind: string
      origin: string | null
      destination: string | null
    }[]
    const doc = rows[0]
    if (!doc) return { error: t(locale, 'actions.docNotFound') }

    await sql`UPDATE documents SET deleted_at = now() WHERE id = ${id}`
    await auditDelete(check.user.companyId, who, 'delete_document', doc.title, doc.kind, doc.origin, doc.destination)
  } catch (e) {
    return { error: humanError(e, locale) }
  }
  revalidatePath('/docs')
  revalidatePath('/logins')
  revalidatePath('/trucks', 'layout')
  revalidatePath('/loads', 'layout')
}

/** Pull a document back out of the trash — the safe direction, no PIN needed. */
export async function restoreDocument(id: number): Promise<void> {
  const ro = await demoReadOnly()
  if (ro) return
  const companyId = await companyScope()
  if (!(await docBelongs(companyId, id))) return
  await sql`UPDATE documents SET deleted_at = NULL WHERE id = ${id}`
  revalidatePath('/docs')
  revalidatePath('/trucks', 'layout')
  revalidatePath('/loads', 'layout')
}

/** Erases a trashed document for real — same name + PIN guard as the soft delete,
 * since this direction can't be undone. */
export async function purgeDocument(id: number, confirm: string): Promise<{ error: string } | void> {
  const ro = await demoReadOnly()
  if (ro) return ro
  const locale = await getLocale()
  const check = await confirmDelete(confirm, locale)
  if ('error' in check) return { error: check.error }
  const who = check.user.name || t(locale, 'actions.dispatcherFallback')
  if (!(await docBelongs(check.user.companyId, id))) return { error: t(locale, 'actions.docNotInTrash') }

  try {
    const rows = (await sql`
      SELECT d.title, d.kind, l.origin, l.destination
      FROM documents d LEFT JOIN loads l ON l.id = d.load_id
      WHERE d.id = ${id} AND d.deleted_at IS NOT NULL`) as {
      title: string
      kind: string
      origin: string | null
      destination: string | null
    }[]
    const doc = rows[0]
    if (!doc) return { error: t(locale, 'actions.docNotInTrash') }

    await sql`DELETE FROM documents WHERE id = ${id}`
    await auditDelete(check.user.companyId, who, 'purge_document', doc.title, doc.kind, doc.origin, doc.destination)
  } catch (e) {
    return { error: humanError(e, locale) }
  }
  revalidatePath('/docs')
  revalidatePath('/logins')
}

/**
 * Edit a load's details after it exists — the whole "Детали" panel is editable, so
 * the dispatcher can fix anything the RC parse got wrong. All fields feed calcLoad,
 * so the page re-renders with fresh profit after saving. Validation mirrors the
 * loads CHECK constraints, so a bad value returns a friendly error, not a DB throw.
 */
export type LoadDetailsPatch = {
  rate: number
  loadedMiles: number
  deadheadMiles: number
  transitDays: number
  spotRpm: number | null
  brokerName: string | null
  brokerMc: string | null
  brokerPhone: string | null
  brokerEmail: string | null
  pickupDate: string | null
  deliveryDate: string | null
  /** Едет в одном трейлере с другим грузом — см. lib/map.ts activeLoadsByTruck. */
  partial?: boolean
  /** Остановки, поправленные руками (ИИ прочитал город/дату не так). */
  stops?: LoadStop[]
}

export async function updateLoadDetails(loadId: number, p: LoadDetailsPatch): Promise<{ error: string } | void> {
  const ro = await demoReadOnly()
  if (ro) return ro
  const locale = await getLocale()
  if (!(p.rate >= 0)) return { error: t(locale, 'actions.rateNegative') }
  if (!(p.loadedMiles > 0)) return { error: t(locale, 'actions.loadedMilesPositive') }
  if (!(p.deadheadMiles >= 0)) return { error: t(locale, 'actions.deadheadNegative') }
  if (!(p.transitDays > 0)) return { error: t(locale, 'actions.transitDaysPositive') }
  if (p.spotRpm != null && !(p.spotRpm >= 0)) return { error: t(locale, 'actions.spotRateNegative') }
  try {
    await sql`UPDATE loads SET
      rate = ${p.rate}, loaded_miles = ${p.loadedMiles}, deadhead_miles = ${p.deadheadMiles}, miles_estimated = false,
      transit_days = ${p.transitDays}, spot_rpm = ${p.spotRpm},
      broker_name = ${p.brokerName || null},
      broker_mc = ${p.brokerMc || null}, broker_phone = ${p.brokerPhone || null},
      broker_email = ${p.brokerEmail || null}, pickup_date = ${p.pickupDate || null},
      delivery_date = ${p.deliveryDate || null},
      partial = COALESCE(${p.partial ?? null}, partial),
      stops = COALESCE(${p.stops?.length ? JSON.stringify(p.stops) : null}::jsonb, stops)
      WHERE id = ${loadId} AND company_id = ${await companyScope()}`
  } catch (e) {
    return { error: humanError(e, locale) }
  }
  revalidatePath(`/loads/${loadId}`)
  revalidatePath('/loads')
  revalidatePath('/', 'layout')
}

/**
 * Партиал: груз едет в одном трейлере с текущим. Кнопка в панели после
 * распознавания рейт-кона и галочка в «Деталях». Такой груз не вытесняет текущий
 * с карты и со страницы водителя и не встаёт «следующим».
 */
export async function setLoadPartial(loadId: number, partial: boolean): Promise<{ error: string } | void> {
  const ro = await demoReadOnly()
  if (ro) return ro
  const companyId = await companyScope()
  if (!(await loadBelongs(companyId, loadId))) return { error: t(await getLocale(), 'actions.loadNotFound') }
  const rows =
    (await sql`UPDATE loads SET partial = ${partial} WHERE id = ${loadId} AND company_id = ${companyId} RETURNING truck_id`) as {
      truck_id: number | null
    }[]
  revalidatePath(`/loads/${loadId}`)
  if (rows[0]?.truck_id) revalidatePath(`/trucks/${rows[0].truck_id}`)
  revalidatePath('/loads')
  revalidatePath('/', 'layout')
}

/** Save the broker's special-instructions text (the "must read" block). */
export async function setBrokerNotes(loadId: number, notes: string): Promise<{ error: string } | void> {
  const ro = await demoReadOnly()
  if (ro) return ro
  try {
    await sql`UPDATE loads SET broker_notes = ${notes.trim() || null}
      WHERE id = ${loadId} AND company_id = ${await companyScope()}`
  } catch (e) {
    return { error: humanError(e, await getLocale()) }
  }
  revalidatePath(`/loads/${loadId}`)
}

/** Translates a load's broker notes (Russian dispatcher, English rate cons). */
export async function translateBrokerNotes(
  text: string,
  targetLang: 'ru' | 'en',
): Promise<{ text: string } | { error: string }> {
  const locale = await getLocale()
  if (!text.trim()) return { error: t(locale, 'actions.emptyText') }
  const { translatePlainText } = await import('@/lib/ratecon-gemini')
  const res = await translatePlainText(text, targetLang === 'ru' ? 'Russian' : 'English')
  if ('error' in res)
    return {
      error:
        res.error === 'no_key'
          ? t(locale, 'actions.aiUnavailable')
          : `${t(locale, 'actions.translateFailed')} ${res.error}`,
    }
  return res
}

/** Dispatcher acknowledged the broker notes — stops highlighting them. */
export async function markNotesRead(loadId: number): Promise<void> {
  const ro = await demoReadOnly()
  if (ro) return
  await sql`UPDATE loads SET notes_read_at = now()
    WHERE id = ${loadId} AND company_id = ${await companyScope()} AND notes_read_at IS NULL`
  revalidatePath(`/loads/${loadId}`)
}

/**
 * Re-read the load's attached rate con with Gemini and fill in everything the
 * document itself carries but this load was created without: the "Важное от
 * брокера" briefing, pickup/delivery date+time, pickup/delivery street address (for
 * the exact map pin), and transit days. Resets notes_read_at so notes must be read
 * again. Never touches rate/miles/origin/destination — those the dispatcher may have
 * already corrected by hand, and this button's job is filling gaps, not overwriting.
 *
 * Reuses the exact same aiToFields → toQrLoad mapping the initial RC-drop creation
 * path uses (app/actions.ts createLoadFromRc), so a load created before those fields
 * existed catches up to one created after, field for field.
 */
export async function parseRcForNotes(loadId: number): Promise<{ error: string } | { ok: true; found: boolean }> {
  const ro = await demoReadOnly()
  if (ro) return ro
  const companyId = await companyScope()
  const locale = await getLocale()
  if (!(await loadBelongs(companyId, loadId))) return { error: t(locale, 'actions.loadNotFound') }
  // Postgres base64 comes newline-wrapped (PEM style); Gemini's decoder rejects the
  // newlines, so strip them.
  const docs = (await sql`
    SELECT replace(encode(data, 'base64'), E'\n', '') AS b64, mime
    FROM documents WHERE load_id = ${loadId} AND company_id = ${companyId} AND kind = 'ratecon'
    ORDER BY uploaded_at DESC LIMIT 1`) as { b64: string; mime: string }[]
  const doc = docs[0]
  if (!doc) return { error: t(locale, 'actions.noRcAttached') }

  const { geminiExtract } = await import('@/lib/ratecon-gemini')
  const res = await geminiExtract({ pdfBase64: doc.b64, mime: doc.mime })
  if ('error' in res)
    return {
      error:
        res.error === 'no_key'
          ? t(locale, 'actions.aiUnavailable')
          : `${t(locale, 'actions.recognizeFailed')} ${res.error}`,
    }

  const { aiToFields } = await import('@/lib/ratecon-ai-contract')
  const fields = aiToFields(res.fields, res.model)
  const load = toQrLoad(fields)
  const driverInfo = formatDriverInfo(fields)

  try {
    // COALESCE у реквизитов брокера, а не присваивание: у груза, заведённого с DAT по
    // QR, брокер приходит одним названием без MC и почты, и рейт-кон — единственное
    // место, где они есть. Но если диспетчер уже поправил их руками, перезаписывать
    // нельзя, поэтому дописываем только пустые.
    await sql`UPDATE loads SET
      broker_notes = ${load.brokerNotes}, notes_read_at = NULL,
      transit_days = ${load.transitDays},
      pickup_date = ${load.pickupDate}, delivery_date = ${load.deliveryDate},
      pickup_time = ${load.pickupTime}, delivery_time = ${load.deliveryTime},
      pickup_address = ${load.pickupAddress}, delivery_address = ${load.deliveryAddress},
      broker_name = COALESCE(broker_name, ${load.brokerName}),
      broker_mc = COALESCE(broker_mc, ${load.brokerMc}),
      broker_phone = COALESCE(broker_phone, ${load.brokerPhone}),
      broker_email = COALESCE(broker_email, ${load.brokerEmail}),
      reference_id = COALESCE(reference_id, ${load.referenceId}),
      pay_via = COALESCE(pay_via, ${load.payVia}),
      driver_info = ${driverInfo},
      stops = COALESCE(${fields.stops && fields.stops.length > 2 ? JSON.stringify(await fillStopCitiesFromZip(fields.stops)) : null}::jsonb, stops)
      WHERE id = ${loadId} AND company_id = ${companyId}`
  } catch (e) {
    return { error: humanError(e, locale) }
  }
  revalidatePath(`/loads/${loadId}`)
  revalidatePath('/trucks', 'layout')
  revalidatePath('/', 'layout')
  return { ok: true, found: !!load.brokerNotes }
}

/**
 * Delete a load. Guarded like document deletion (the user's own password → audit row
 * in the Журнал). Its documents are kept but detached, so the paperwork stays in the
 * library instead of blocking the delete on the foreign key.
 */
export async function deleteLoad(id: number, confirm: string): Promise<{ error: string } | void> {
  const ro = await demoReadOnly()
  if (ro) return ro
  const locale = await getLocale()
  const check = await confirmDelete(confirm, locale)
  if ('error' in check) return { error: check.error }
  const who = check.user.name || t(locale, 'actions.dispatcherFallback')
  if (!(await loadBelongs(check.user.companyId, id))) return { error: t(locale, 'actions.loadNotFound') }

  try {
    const rows = (await sql`SELECT origin, destination FROM loads WHERE id = ${id}`) as {
      origin: string | null
      destination: string | null
    }[]
    const load = rows[0]
    if (!load) return { error: t(locale, 'actions.loadNotFound') }

    await sql`UPDATE documents SET load_id = NULL WHERE load_id = ${id}`
    await sql`DELETE FROM loads WHERE id = ${id}`

    const route = [load.origin, load.destination].filter(Boolean).join(' → ') || `#${id}`
    await auditDelete(check.user.companyId, who, 'delete_load', route, null, load.origin, load.destination)
  } catch (e) {
    return { error: humanError(e, locale) }
  }
  revalidatePath('/loads')
  revalidatePath('/')
  revalidatePath('/trucks', 'layout')
  revalidatePath('/logins')
}

/* ---------- Truck care: maintenance log, to-fix list, passport ---------- */

export type MaintenanceInput = {
  kind: 'repair' | 'service' | 'inspection'
  title: string
  notes: string
  cost: number | null
  odometer: number | null
  doneAt: string // YYYY-MM-DD
}

export async function addMaintenance(truckId: number, m: MaintenanceInput): Promise<{ error: string } | void> {
  const ro = await demoReadOnly()
  if (ro) return ro
  const locale = await getLocale()
  if (!m.title.trim()) return { error: t(locale, 'actions.sayWhatWasDone') }
  if (!(await truckBelongs(await companyScope(), truckId))) return { error: t(locale, 'actions.truckNotFound') }
  try {
    await sql`
      INSERT INTO truck_maintenance (truck_id, kind, title, notes, cost, odometer, done_at)
      VALUES (${truckId}, ${m.kind}, ${m.title.trim()}, ${m.notes.trim() || null},
              ${m.cost}, ${m.odometer}, ${m.doneAt})`
    // An oil change in the log IS the oil counter's reset point — one entry, two effects.
    if (m.kind === 'service' && m.odometer !== null && /масл|oil/i.test(m.title)) {
      await sql`
        INSERT INTO truck_meta (truck_id, oil_last_odometer) VALUES (${truckId}, ${m.odometer})
        ON CONFLICT (truck_id) DO UPDATE SET oil_last_odometer = ${m.odometer}`
    }
  } catch (e) {
    return { error: humanError(e, locale) }
  }
  revalidatePath(`/trucks/${truckId}`)
}

export async function deleteMaintenance(
  id: number,
  truckId: number,
  confirm: string,
): Promise<{ error: string } | void> {
  const ro = await demoReadOnly()
  if (ro) return ro
  const locale = await getLocale()
  const check = await confirmDelete(confirm, locale)
  if ('error' in check) return { error: check.error }
  const who = check.user.name || t(locale, 'actions.dispatcherFallback')
  if (!(await truckBelongs(check.user.companyId, truckId))) return { error: t(locale, 'actions.truckNotFound') }

  const rows = (await sql`
    SELECT title FROM truck_maintenance WHERE id = ${id} AND truck_id = ${truckId}`) as {
    title: string
  }[]
  if (!rows[0]) return { error: t(locale, 'actions.entryNotFound') }

  await sql`DELETE FROM truck_maintenance WHERE id = ${id}`
  await auditDelete(check.user.companyId, who, 'delete_maintenance', rows[0].title, null, null, null)
  revalidatePath(`/trucks/${truckId}`)
  revalidatePath('/logins')
}

export async function addTodo(
  truckId: number,
  title: string,
  priority: 'low' | 'normal' | 'urgent',
): Promise<{ error: string } | void> {
  const ro = await demoReadOnly()
  if (ro) return ro
  const locale = await getLocale()
  if (!title.trim()) return { error: t(locale, 'actions.sayWhatToFix') }
  if (!(await truckBelongs(await companyScope(), truckId))) return { error: t(locale, 'actions.truckNotFound') }
  try {
    await sql`INSERT INTO truck_todos (truck_id, title, priority)
              VALUES (${truckId}, ${title.trim()}, ${priority})`
  } catch (e) {
    return { error: humanError(e, locale) }
  }
  revalidatePath(`/trucks/${truckId}`)
}

export async function toggleTodo(id: number, truckId: number): Promise<void> {
  const ro = await demoReadOnly()
  if (ro) return
  if (!(await truckBelongs(await companyScope(), truckId))) return
  await sql`UPDATE truck_todos
            SET done_at = CASE WHEN done_at IS NULL THEN now() ELSE NULL END
            WHERE id = ${id} AND truck_id = ${truckId}`
  revalidatePath(`/trucks/${truckId}`)
}

export async function deleteTodo(id: number, truckId: number, confirm: string): Promise<{ error: string } | void> {
  const ro = await demoReadOnly()
  if (ro) return ro
  const locale = await getLocale()
  const check = await confirmDelete(confirm, locale)
  if ('error' in check) return { error: check.error }
  const who = check.user.name || t(locale, 'actions.dispatcherFallback')
  if (!(await truckBelongs(check.user.companyId, truckId))) return { error: t(locale, 'actions.truckNotFound') }

  const rows = (await sql`SELECT title FROM truck_todos WHERE id = ${id} AND truck_id = ${truckId}`) as {
    title: string
  }[]
  if (!rows[0]) return { error: t(locale, 'actions.entryNotFound') }

  await sql`DELETE FROM truck_todos WHERE id = ${id}`
  await auditDelete(check.user.companyId, who, 'delete_todo', rows[0].title, null, null, null)
  revalidatePath(`/trucks/${truckId}`)
  revalidatePath('/logins')
}

export type TruckMetaInput = {
  vin: string
  plate: string
  trailerNumber: string
  year: number | null
  make: string
  model: string
  oilIntervalMi: number
  oilLastOdometer: number | null
  driverPhone: string
  notes: string
  registrationExpiry: string | null
  inspectionExpiry: string | null
  insuranceExpiry: string | null
  cdlExpiry: string | null
  medcardExpiry: string | null
}

const d = (s: string | null) => (s && s.trim() ? s : null)

/**
 * Everything about the person driving this truck, in one place. Name lives on the
 * truck row, contact + licence dates on truck_meta — this writes both without
 * touching the rest of the passport (VIN, plate, oil…).
 */
export async function saveDriverInfo(
  truckId: number,
  d: {
    name: string
    phone: string
    cdlExpiry: string
    medcardExpiry: string
    /** Номера трака, прицепа и VIN — те самые, что диспетчер диктует брокеру. Раньше
     * они правились только в «паспорте трака» этажом ниже, и человек, открывший
     * карточку водителя, менял имя с телефоном, а номер прицепа искал в другом месте.
     * Необязательные: старые вызовы этих полей не передают и ничего не затирают. */
    truckNumber?: string
    trailerNumber?: string
    vin?: string
  },
): Promise<{ error: string } | void> {
  const ro = await demoReadOnly()
  if (ro) return ro
  const locale = await getLocale()
  if (!(await truckBelongs(await companyScope(), truckId))) return { error: t(locale, 'actions.truckNotFound') }
  try {
    await sql`UPDATE trucks SET driver_name = ${d.name.trim() || null} WHERE id = ${truckId}`
    // Номер трака стирать нельзя: по нему GPS находит машину (fleet_status.unit).
    // Пустое поле значит «не менял», а не «убрать».
    const num = d.truckNumber?.trim()
    if (num) await sql`UPDATE trucks SET number = ${num} WHERE id = ${truckId}`
    const trailer = d.trailerNumber?.trim() ?? null
    const vin = d.vin?.trim() ?? null
    await sql`
      INSERT INTO truck_meta (truck_id, driver_phone, cdl_expiry, medcard_expiry, trailer_number, vin)
      VALUES (${truckId}, ${d.phone.trim() || null}, ${d.cdlExpiry || null}, ${d.medcardExpiry || null},
              ${trailer}, ${vin})
      ON CONFLICT (truck_id) DO UPDATE SET
        driver_phone   = EXCLUDED.driver_phone,
        cdl_expiry     = EXCLUDED.cdl_expiry,
        medcard_expiry = EXCLUDED.medcard_expiry,
        -- COALESCE, а не присваивание: форма может не показывать эти поля (её зовут
        -- и с других экранов), и тогда пустое значение не должно стирать номер.
        trailer_number = COALESCE(EXCLUDED.trailer_number, truck_meta.trailer_number),
        vin            = COALESCE(EXCLUDED.vin, truck_meta.vin)`
  } catch (e) {
    return { error: humanError(e, locale) }
  }
  revalidatePath(`/trucks/${truckId}`)
  revalidatePath('/trucks')
  revalidatePath('/', 'layout')
}

const MAX_PHOTO_BYTES = 4 * 1024 * 1024

/** FormData: file. Stored on truck_meta, served by /api/driver-photo/[truckId]. */
export async function saveDriverPhoto(truckId: number, fd: FormData): Promise<{ error: string } | void> {
  const ro = await demoReadOnly()
  if (ro) return ro
  const locale = await getLocale()
  const file = fd.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: t(locale, 'actions.noFileSelected') }
  if (file.size > MAX_PHOTO_BYTES) return { error: t(locale, 'actions.fileOver4mb') }
  if (!file.type.startsWith('image/')) return { error: t(locale, 'actions.needImage') }
  if (!(await truckBelongs(await companyScope(), truckId))) return { error: t(locale, 'actions.truckNotFound') }

  const hex = Buffer.from(await file.arrayBuffer()).toString('hex')
  try {
    await sql`
      INSERT INTO truck_meta (truck_id, driver_photo, driver_photo_mime)
      VALUES (${truckId}, decode(${hex}, 'hex'), ${file.type})
      ON CONFLICT (truck_id) DO UPDATE SET
        driver_photo      = EXCLUDED.driver_photo,
        driver_photo_mime = EXCLUDED.driver_photo_mime`
  } catch (e) {
    return { error: humanError(e, locale) }
  }
  revalidatePath(`/trucks/${truckId}`)
  revalidatePath('/trucks')
  revalidatePath('/', 'layout')
}

/** Своё фото трака для шапки карточки. FormData: file. Отдаёт /api/truck-photo/[truckId]. */
export async function saveTruckPhoto(truckId: number, fd: FormData): Promise<{ error: string } | void> {
  const ro = await demoReadOnly()
  if (ro) return ro
  const locale = await getLocale()
  const file = fd.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: t(locale, 'actions.noFileSelected') }
  if (file.size > MAX_PHOTO_BYTES) return { error: t(locale, 'actions.fileOver4mb') }
  if (!file.type.startsWith('image/')) return { error: t(locale, 'actions.needImage') }
  if (!(await truckBelongs(await companyScope(), truckId))) return { error: t(locale, 'actions.truckNotFound') }

  const hex = Buffer.from(await file.arrayBuffer()).toString('hex')
  try {
    await sql`
      INSERT INTO truck_meta (truck_id, truck_photo, truck_photo_mime)
      VALUES (${truckId}, decode(${hex}, 'hex'), ${file.type})
      ON CONFLICT (truck_id) DO UPDATE SET
        truck_photo      = EXCLUDED.truck_photo,
        truck_photo_mime = EXCLUDED.truck_photo_mime,
        truck_model      = NULL`
  } catch (e) {
    return { error: humanError(e, locale) }
  }
  revalidatePath(`/trucks/${truckId}`)
}

/** Готовая картинка трака из списка (lib/truck-models.ts) или null — стандартная.
 * Своё загруженное фото при этом снимается: показывается то, что выбрали последним. */
export async function saveTruckModel(truckId: number, model: string | null): Promise<{ error: string } | void> {
  const ro = await demoReadOnly()
  if (ro) return ro
  const locale = await getLocale()
  const { isTruckModel } = await import('@/lib/truck-models')
  if (model !== null && !isTruckModel(model)) return { error: 'bad model' }
  if (!(await truckBelongs(await companyScope(), truckId))) return { error: t(locale, 'actions.truckNotFound') }
  try {
    await sql`
      INSERT INTO truck_meta (truck_id, truck_model)
      VALUES (${truckId}, ${model})
      ON CONFLICT (truck_id) DO UPDATE SET
        truck_model      = EXCLUDED.truck_model,
        truck_photo      = NULL,
        truck_photo_mime = NULL`
  } catch (e) {
    return { error: humanError(e, locale) }
  }
  revalidatePath(`/trucks/${truckId}`)
}

export async function saveTruckMeta(truckId: number, m: TruckMetaInput): Promise<{ error: string } | void> {
  const ro = await demoReadOnly()
  if (ro) return ro
  const locale = await getLocale()
  if (!(await truckBelongs(await companyScope(), truckId))) return { error: t(locale, 'actions.truckNotFound') }
  try {
    await sql`
      INSERT INTO truck_meta (truck_id, vin, plate, trailer_number, year, make, model,
                              oil_interval_mi, oil_last_odometer, driver_phone, notes,
                              registration_expiry, inspection_expiry, insurance_expiry,
                              cdl_expiry, medcard_expiry)
      VALUES (${truckId}, ${m.vin.trim() || null}, ${m.plate.trim() || null},
              ${m.trailerNumber.trim() || null}, ${m.year},
              ${m.make.trim() || null}, ${m.model.trim() || null}, ${m.oilIntervalMi},
              ${m.oilLastOdometer}, ${m.driverPhone.trim() || null}, ${m.notes.trim() || null},
              ${d(m.registrationExpiry)}, ${d(m.inspectionExpiry)}, ${d(m.insuranceExpiry)},
              ${d(m.cdlExpiry)}, ${d(m.medcardExpiry)})
      ON CONFLICT (truck_id) DO UPDATE SET
        vin = EXCLUDED.vin, plate = EXCLUDED.plate, trailer_number = EXCLUDED.trailer_number, year = EXCLUDED.year,
        make = EXCLUDED.make, model = EXCLUDED.model,
        oil_interval_mi = EXCLUDED.oil_interval_mi,
        oil_last_odometer = EXCLUDED.oil_last_odometer,
        driver_phone = EXCLUDED.driver_phone, notes = EXCLUDED.notes,
        registration_expiry = EXCLUDED.registration_expiry,
        inspection_expiry = EXCLUDED.inspection_expiry,
        insurance_expiry = EXCLUDED.insurance_expiry,
        cdl_expiry = EXCLUDED.cdl_expiry, medcard_expiry = EXCLUDED.medcard_expiry`
  } catch (e) {
    return { error: humanError(e, locale) }
  }
  revalidatePath(`/trucks/${truckId}`)
  revalidatePath('/')
}

export async function addTruck(t: TruckInput): Promise<{ error: string } | void> {
  const ro = await demoReadOnly()
  if (ro) return ro
  t = finiteTruck(t)
  const cpm = t.driverPay.mode === 'cpm' ? t.driverPay.centsPerMile : null
  const pct = t.driverPay.mode === 'percent' ? t.driverPay.percentOfGross : null
  let id: number
  try {
    const rows = await sql`
      INSERT INTO trucks (name, number, driver_name, mpg, fuel_price_per_gallon,
                          driver_pay_mode, driver_cents_per_mile, driver_percent_of_gross,
                          truck_payment_per_day, insurance_per_day, eld_permits_per_day,
                          maintenance_cost_per_mile, factoring_percent, dispatch_percent, company_id)
      VALUES (${t.number || 'Трак'}, ${t.number}, ${t.driverName}, ${t.mpg},
              ${t.fuelPricePerGallon}, ${t.driverPay.mode}, ${cpm}, ${pct},
              ${t.truckPaymentPerDay}, ${t.insurancePerDay}, ${t.eldPermitsPerDay},
              ${t.maintenanceCostPerMile}, ${t.factoringPercent}, ${t.dispatchPercent}, ${await companyScope()})
      RETURNING id`
    id = (rows[0] as { id: number }).id
  } catch (e) {
    return { error: humanError(e, await getLocale()) }
  }
  revalidatePath('/trucks')
  redirect(`/trucks/${id}`)
}
/** Trip history for one truck over a window, so the /trucks/[id] panel can switch
 * 24h/3d/7d WITHOUT a page navigation. It used to be three <Link>s carrying ?history=,
 * which re-rendered the entire truck page — map, loads, documents and all — to replace
 * one list, and since app/loading.tsx added a route-level Suspense boundary that swap
 * also flashed a full-page skeleton. */
export async function truckTripHistory(
  truckId: number,
  hours: number,
): Promise<{ legs: HistoryLeg[] } | { error: string }> {
  const companyId = await companyScope()
  const locale = await getLocale()
  if (!(await truckBelongs(companyId, truckId))) return { error: t(locale, 'actions.truckNotFound') }
  // Only the three windows the UI offers — an arbitrary number here would let a caller
  // ask for a year of points, and the table is pruned to 7 days anyway (lib/eld.ts).
  if (![24, 72, 168].includes(hours)) return { error: t(locale, 'actions.truckNotFound') }
  const rows = (await sql`SELECT number FROM trucks WHERE id = ${truckId}`) as {
    number: string | null
  }[]
  const unit = rows[0]?.number
  if (!unit) return { legs: [] }
  const { tripHistory } = await import('@/lib/eld')
  return { legs: await tripHistory(unit, hours) }
}

/** Title and mime of one document, so a viewer can open in a modal instead of a page.
 * Never returns the bytes — those still go through /api/docs/[id], which streams them
 * with its own company check and caching. */
export async function docMeta(id: number): Promise<{ title: string; mime: string } | { error: string }> {
  const companyId = await companyScope()
  const locale = await getLocale()
  if (!(await docBelongs(companyId, id))) return { error: t(locale, 'actions.docNotFound') }
  const rows = (await sql`SELECT title, mime FROM documents WHERE id = ${id}`) as {
    title: string
    mime: string
  }[]
  const row = rows[0]
  return row ? { title: row.title, mime: row.mime } : { error: t(locale, 'actions.docNotFound') }
}

/* ---------- Платные дороги ---------- */

export type TollCheck = {
  options: import('@/lib/tolls').RouteOption[]
  from: { lat: number; lng: number }
  to: { lat: number; lng: number }
  /** Цена мили пробега у выбранного трака — по ней считалась полная стоимость. */
  costPerMile: number
  /** Заполняется, когда считали под конкретный груз: видно, что толлы делают с
   * его чистой прибылью. Без этого раздел остаётся калькулятором, а с этим
   * отвечает на вопрос, ради которого груз и берут. */
  load: { id: number; lane: string; rate: number; netBefore: number } | null
  used: number
  cap: number
}

/**
 * Считает варианты маршрута с платными дорогами.
 *
 * Два обращения к HERE, не больше: первое приносит основной маршрут и две
 * альтернативы одним ответом, второе — попытку объехать платные. Дальше всё
 * считается у нас.
 *
 * Варианты ранжируются по ПОЛНОЙ стоимости — толлы плюс пробег, — потому что
 * маршрут с наименьшими толлами почти всегда самый длинный, и экономия уходит в
 * топливо. Сравнивать по одним толлам значило бы советовать заведомо худшее.
 */
export async function checkTolls(input: {
  from: string
  to: string
  axles: number
  grossWeightLb: number
  /** Трак, по экономике которого считается цена лишней мили. */
  truckId?: number | null
  /** Груз, под который считаем: подставляет маршрут и показывает удар по чистой. */
  loadId?: number | null
  /** Города, через которые маршрут обязан пройти, — по порядку. */
  via?: string[]
  /** Момент выезда: часть дорог тарифицируется по часу. */
  departure?: string | null
}): Promise<TollCheck | { error: string }> {
  const locale = await getLocale()
  const companyId = await companyScope()

  // Груз задаёт маршрут сам: диспетчер выбирает груз, а не перепечатывает города.
  let load: TollCheck['load'] = null
  let from = input.from
  let to = input.to
  let truckId = input.truckId ?? null
  if (input.loadId) {
    const l = await getLoad(companyId, input.loadId)
    if (l) {
      from = l.origin ?? from
      to = l.destination ?? to
      truckId = truckId ?? l.truckId
      const truckForLoadFn = (await import('@/lib/loads')).truckForLoad
      const tr = await truckForLoadFn(companyId, l)
      const { calcLoad } = await import('@/lib/profit')
      load = {
        id: l.id,
        lane: `${l.origin ?? '—'} → ${l.destination ?? '—'}`,
        rate: l.rate,
        netBefore: calcLoad(l, tr).net,
      }
    }
  }

  if (!from?.trim() || !to?.trim()) return { error: t(locale, 'actions.needOriginDest') }

  const { cityCoords } = await import('@/lib/geo-routing')
  const viaNames = (input.via ?? []).map((v) => v.trim()).filter(Boolean)
  const [a, b, ...viaPoints] = await Promise.all([
    cityCoords(from),
    cityCoords(to),
    ...viaNames.map((v) => cityCoords(v)),
  ])
  if (!a || !b) return { error: t(locale, 'tolls.notFound') }
  // Ненайденная промежуточная точка — не повод считать «как получится»: маршрут
  // получился бы не тот, о котором просили, и об этом никто бы не узнал.
  const via = viaPoints.filter((v): v is NonNullable<typeof v> => v !== null)
  if (via.length !== viaNames.length) return { error: t(locale, 'tolls.notFound') }

  const { hereTollRoute, hereUsage } = await import('@/lib/tolls-here')
  const { rankOptions, DEFAULT_TRUCK } = await import('@/lib/tolls')
  const spec = {
    axles: Math.max(2, Math.min(9, Math.round(input.axles) || DEFAULT_TRUCK.axles)),
    grossWeightLb: Math.max(10_000, Math.round(input.grossWeightLb) || DEFAULT_TRUCK.grossWeightLb),
    heightFt: DEFAULT_TRUCK.heightFt,
  }

  const dep = input.departure || undefined
  const main = await hereTollRoute(a, b, spec, { via, departure: dep })
  if ('error' in main) return { error: tollError(main.error, locale) }

  // Объезд запрашиваем, только если платные вообще есть: иначе второе обращение
  // ушло бы из месячной квоты за заранее известный ответ.
  const anyTolls = main.some((q) => q.total > 0)
  const avoid = anyTolls ? await hereTollRoute(a, b, spec, { avoidTolls: true, via, departure: dep }) : null
  const avoidQuotes = avoid && !('error' in avoid) ? avoid : []

  // Цена мили — у ТОГО трака, которым поедут. Разные машины в парке жгут
  // по-разному, и на тысяче миль разница в расходе решает, стоит ли крюк.
  const { getTruck, defaultTruck } = await import('@/lib/loads')
  const truck = (truckId ? await getTruck(companyId, truckId) : null) ?? (await defaultTruck(companyId))
  const costPerMile = truck.fuelPricePerGallon / (truck.mpg || 6.5) + truck.maintenanceCostPerMile

  const options = rankOptions(
    [
      ...main.map((quote, i) => ({
        quote,
        source: (i === 0 ? 'main' : 'alt') as 'main' | 'alt',
      })),
      ...avoidQuotes.map((quote) => ({ quote, source: 'avoid' as const })),
    ],
    costPerMile,
  )

  const usage = await hereUsage()
  return {
    options,
    from: a,
    to: b,
    costPerMile,
    load,
    used: usage.used,
    cap: usage.cap,
  }
}

/** Коды из lib/tolls-here.ts — человеку, а не в консоль. */
function tollError(code: string, locale: Awaited<ReturnType<typeof getLocale>>): string {
  if (code === 'no_key') return t(locale, 'tolls.noKey')
  if (code === 'monthly_cap') return t(locale, 'tolls.capReached')
  if (code === 'no_route') return t(locale, 'tolls.noRoute')
  return `${t(locale, 'tolls.failed')} ${code}`
}

/** Активные грузы — чтобы считать толлы прямо под груз, а не перепечатывать города. */
export async function tollLoadChoices(): Promise<{ id: number; label: string }[]> {
  const companyId = await companyScope()
  const rows = (await sql`
    SELECT id, origin, destination FROM loads
    WHERE company_id = ${companyId} AND status IN ('quoted', 'booked', 'in_transit')
      AND origin IS NOT NULL AND destination IS NOT NULL
    ORDER BY created_at DESC LIMIT 30`) as {
    id: number
    origin: string
    destination: string
  }[]
  return rows.map((r) => ({
    id: r.id,
    label: `${r.origin} → ${r.destination}`,
  }))
}

/**
 * Маршрут из документа: скриншот с DAT, рейт-кон, что угодно с городами.
 *
 * Диспетчер смотрит на груз в борде или на присланный rate con — и там уже
 * написано, откуда и куда. Перепечатывать это в форму руками, чтобы узнать
 * толлы, — лишний шаг ровно там, где решение принимают за секунды.
 *
 * Читает тот же разбор, что и рейт-коны (lib/ratecon-gemini.ts): он умеет
 * доставать остановки из документа, а скриншот борда для модели — такая же
 * картинка с городами. Ставка и мили, если нашлись, тоже возвращаются: по ним
 * сразу видно, что от ставки останется после платных дорог.
 */
export async function tollsFromDocument(
  fd: FormData,
): Promise<{ from: string; to: string; rate: number | null } | { error: string }> {
  const ro = await demoReadOnly()
  if (ro) return ro
  const locale = await getLocale()
  const file = fd.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: t(locale, 'tolls.docEmpty') }
  if (file.size > 8 * 1024 * 1024) return { error: t(locale, 'tolls.docTooBig') }

  const b64 = Buffer.from(await file.arrayBuffer()).toString('base64')
  const { geminiExtract } = await import('@/lib/ratecon-gemini')
  const res = await geminiExtract({
    pdfBase64: b64,
    mime: file.type || 'image/jpeg',
  })
  if ('error' in res)
    return {
      error:
        res.error === 'no_key'
          ? t(locale, 'actions.aiUnavailable')
          : `${t(locale, 'actions.recognizeFailed')} ${res.error}`,
    }

  const { aiToFields, toQrLoad } = await import('@/lib/ratecon-ai-contract').then(async (m) => ({
    aiToFields: m.aiToFields,
    toQrLoad: (await import('@/lib/ratecon')).toQrLoad,
  }))
  const load = toQrLoad(aiToFields(res.fields, res.model))
  if (!load.origin || !load.destination) return { error: t(locale, 'tolls.docNoRoute') }
  return { from: load.origin, to: load.destination, rate: load.rate || null }
}

/**
 * Записывает посчитанные толлы на груз — с этого момента они входят в прибыль.
 *
 * Отдельным действием, а не автоматически при расчёте: маршрут в разделе считают
 * и «на посмотреть», под ещё не взятый груз, и молча менять чистую по чужому
 * грузу от одного взгляда на карту нельзя.
 */
export async function saveLoadTolls(loadId: number, tolls: number): Promise<{ error: string } | void> {
  const ro = await demoReadOnly()
  if (ro) return ro
  const locale = await getLocale()
  const companyId = await companyScope()
  if (!(await loadBelongs(companyId, loadId))) return { error: t(locale, 'actions.loadNotFound') }
  const value = Math.max(0, Math.round(tolls * 100) / 100)
  await sql`UPDATE loads SET toll_cost = ${value} WHERE id = ${loadId} AND company_id = ${companyId}`
  revalidatePath(`/loads/${loadId}`)
  revalidatePath('/loads')
  revalidatePath('/')
  revalidatePath('/invoices')
}

/**
 * Записать падение страницы в журнал (см. app_errors в schema.sql). Зовётся из
 * границы ошибок app/error.tsx. Никогда не бросает: сбой при записи о сбое — это
 * последнее, что должно сломать экран человеку.
 */
export async function logClientError(input: {
  path: string
  message: string
  digest?: string
  agent?: string
}): Promise<void> {
  try {
    const user = await getCurrentUser().catch(() => null)
    const companyId = await companyScope().catch(() => 'default' as const)
    await sql`INSERT INTO app_errors (company_id, user_id, path, message, digest, agent)
              VALUES (${companyId}, ${user?.id ?? null}, ${input.path.slice(0, 300)},
                      ${input.message.slice(0, 2000)}, ${input.digest ?? null}, ${(input.agent ?? '').slice(0, 300)})`
    // Журнал — не помойка: держим последние 500.
    await sql`DELETE FROM app_errors WHERE id < (SELECT COALESCE(MAX(id), 0) - 500 FROM app_errors)`
  } catch {
    /* см. выше */
  }
}

/**
 * Новый трак из ELD одним нажатием. ZigZag уже прислал юнит в fleet_status (номер,
 * водитель, где стоит), а в парке его нет — страница траков показывает его с кнопкой.
 * Экономика копируется с последнего заведённого трака компании: ставки оплаты,
 * страховка, платёж — у одного парка они одинаковые, а в форме их всё равно можно
 * поправить. VIN подтянет ближайший опрос ELD (lib/eld.ts пишет его в truck_meta).
 */
export async function addTruckFromEld(unit: string): Promise<{ error: string } | { id: number }> {
  const ro = await demoReadOnly()
  if (ro) return ro
  const locale = await getLocale()
  const companyId = await companyScope()
  const number = unit.trim()
  if (!number || number.startsWith('DEMO-')) return { error: t(locale, 'actions.truckNotFound') }
  try {
    const dup = await sql`SELECT id FROM trucks WHERE company_id = ${companyId} AND number = ${number}`
    if (dup[0]) return { id: (dup[0] as { id: number }).id }
    const fs = (await sql`SELECT driver_name FROM fleet_status WHERE unit = ${number}`)[0] as
      { driver_name: string | null } | undefined
    // Водитель в ELD — «Фамилия Имя»; в парке принято «Имя Фамилия».
    const driver = (fs?.driver_name ?? '').trim().split(/\s+/).reverse().join(' ')
    const rows = await sql`
      INSERT INTO trucks (name, number, driver_name, mpg, fuel_price_per_gallon,
                          driver_pay_mode, driver_cents_per_mile, driver_percent_of_gross,
                          truck_payment_per_day, insurance_per_day, eld_permits_per_day,
                          maintenance_cost_per_mile, factoring_percent, dispatch_percent, company_id)
      SELECT ${number}, ${number}, ${driver}, mpg, fuel_price_per_gallon,
             driver_pay_mode, driver_cents_per_mile, driver_percent_of_gross,
             truck_payment_per_day, insurance_per_day, eld_permits_per_day,
             maintenance_cost_per_mile, factoring_percent, dispatch_percent, company_id
      FROM trucks WHERE company_id = ${companyId}
      ORDER BY id DESC LIMIT 1
      RETURNING id`
    if (!rows[0]) return { error: t(locale, 'actions.truckNotFound') }
    const id = (rows[0] as { id: number }).id
    revalidatePath('/trucks')
    revalidatePath('/')
    return { id }
  } catch (e) {
    return { error: humanError(e, locale) }
  }
}

/**
 * «Не тот файл» сразу после загрузки рейт-кона: удалить только что созданный груз и
 * убрать его рейт-кон и Driver Info в корзину одним нажатием. Только пока груз не в
 * работе: моложе двух часов, без отметок водителя и без BOL, POD и фото. Иначе —
 * удаление на карточке груза с подтверждением. Файлы возвращаются из корзины.
 */
export async function undoRcUpload(loadId: number): Promise<{ error: string } | void> {
  const ro = await demoReadOnly()
  if (ro) return ro
  const locale = await getLocale()
  const companyId = await companyScope()
  if (!(await loadBelongs(companyId, loadId))) return { error: t(locale, 'actions.loadNotFound') }
  const rows = (await sql`
    SELECT l.origin, l.destination, l.truck_id,
      (l.created_at > now() - interval '2 hours') AS fresh,
      (SELECT count(*) FROM load_events e WHERE e.load_id = l.id)::int AS events,
      (SELECT count(*) FROM documents d
        WHERE d.load_id = l.id AND d.deleted_at IS NULL AND d.kind NOT IN ('ratecon', 'driverinfo'))::int AS docs
    FROM loads l WHERE l.id = ${loadId} AND l.company_id = ${companyId}`) as {
    origin: string | null
    destination: string | null
    truck_id: number | null
    fresh: boolean
    events: number
    docs: number
  }[]
  const l = rows[0]
  if (!l) return { error: t(locale, 'actions.loadNotFound') }
  if (!l.fresh || l.events > 0 || l.docs > 0) return { error: t(locale, 'actions.undoTooLate') }
  const who = (await getCurrentUser())?.name || t(locale, 'actions.dispatcherFallback')
  try {
    await sql`UPDATE documents SET deleted_at = now(), load_id = NULL
              WHERE load_id = ${loadId} AND kind IN ('ratecon', 'driverinfo')`
    await sql`UPDATE documents SET load_id = NULL WHERE load_id = ${loadId}`
    await sql`DELETE FROM loads WHERE id = ${loadId} AND company_id = ${companyId}`
    const route = [l.origin, l.destination].filter(Boolean).join(' → ') || `#${loadId}`
    await auditDelete(companyId, who, 'undo_rc_upload', route, 'ratecon', l.origin, l.destination)
  } catch (e) {
    return { error: humanError(e, locale) }
  }
  if (l.truck_id) revalidatePath(`/trucks/${l.truck_id}`)
  revalidatePath('/loads')
  revalidatePath('/docs')
  revalidatePath('/')
}
