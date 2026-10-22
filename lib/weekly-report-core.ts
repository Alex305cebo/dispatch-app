// Недельный отчёт по тракам на почту (владелец, 10/22/26: «каждое воскресенье полный отчёт
// за прошедшую неделю, аккуратно и компактно, с инвойсами и чеками за ремонт и масло»).
//
// Чистый модуль: какая неделя, что в ней было и как это выглядит письмом. Без базы и без
// почты — см. weekly-report-core.test.ts; данные собирает lib/weekly-report.ts.
//
// Письмо — таблицы с инлайновыми стилями: почтовые программы не знают ни классов, ни
// flex, а Gmail режет <style>. Шкалы — две ячейки таблицы разной ширины, так их рисует
// любой клиент. Цифр мало, полос и клеток много — правило владельца для всего TMS.

import { calcLoad, type Breakdown } from './profit.ts'
import type { LoadRecord, TruckRecord } from './map.ts'
import { isOilRecord, serviceKind, type MaintenanceRecord, type OilCard } from './maintenance-core.ts'
import { shortName } from './fmt.ts'

/** Неделя отчёта — понедельник…воскресенье, оба дня включительно, по ET. */
export type ReportWeek = { from: string; to: string }

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Какую неделю слать в день today (ET). В воскресенье — неделю, которая сегодня
 * кончается; в любой другой день — прошлую полную. Запасной запуск в понедельник
 * (расписание GitHub опаздывает на часы) так попадает в ту же неделю, что и воскресный. */
export function reportWeek(today: string): ReportWeek {
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay() // Вс=0
  const sunday = dow === 0 ? today : addDays(today, -dow)
  return { from: addDays(sunday, -6), to: sunday }
}

export const weekDays = (w: ReportWeek): string[] => Array.from({ length: 7 }, (_, i) => addDays(w.from, i))

/** Файл, который едет вложением: чек или счёт сервиса, фото ремонта. */
export type ReportFile = {
  id: number
  truckId: number | null
  maintenanceId: number | null
  kind: string
  title: string
  mime: string
  sizeBytes: number
  uploadedAt: string
}

export type ReportInput = {
  week: ReportWeek
  company: string
  appUrl: string
  trucks: TruckRecord[]
  /** Все грузы, которые могли попасть в неделю; отбор — здесь. */
  loads: LoadRecord[]
  /** Записи журнала «Гаража» за неделю. */
  maintenance: MaintenanceRecord[]
  /** Пробег сейчас и масло — по траку. */
  odometer: Map<number, number | null>
  oil: Map<number, OilCard>
  files: ReportFile[]
  /** Файлы, которые не влезли в письмо (предел Gmail 25 МБ) — только список. */
  skipped: ReportFile[]
}

const live = (l: LoadRecord) => l.status !== 'quoted' && l.status !== 'cancelled'

export type TruckWeek = {
  truck: TruckRecord
  loads: LoadRecord[]
  /** 7 дней недели: трак под грузом (пикап…выгрузка) или нет. */
  days: boolean[]
  loaded: number
  empty: number
  gross: number
  /** Гросс ÷ все мили (гружёные + порожние) — как RPM во всём TMS. */
  rpm: number | null
  /** Прибыль по карточке трака (оценка); null — карта трака не считается. */
  net: number | null
  service: MaintenanceRecord[]
  serviceCost: number
}

/** Грузы недели — по дате пикапа, как «Неделя» на «Грузах» и «Сегодня». */
export function weekLoads(loads: LoadRecord[], w: ReportWeek): LoadRecord[] {
  return loads
    .filter((l) => live(l) && !!l.pickupDate && l.pickupDate >= w.from && l.pickupDate <= w.to)
    .sort((a, b) => a.pickupDate!.localeCompare(b.pickupDate!) || a.id - b.id)
}

export function truckWeeks(input: Pick<ReportInput, 'week' | 'trucks' | 'loads' | 'maintenance'>): TruckWeek[] {
  const days = weekDays(input.week)
  const inWeek = weekLoads(input.loads, input.week)
  return input.trucks
    .map((truck) => {
      const loads = inWeek.filter((l) => l.truckId === truck.id)
      // Занятость — по всем рейсам трака, включая начатые на прошлой неделе.
      const covering = input.loads.filter((l) => l.truckId === truck.id && live(l) && l.pickupDate)
      const busy = days.map((d) => covering.some((l) => l.pickupDate! <= d && (l.deliveryDate ?? l.pickupDate!) >= d))
      const loaded = loads.reduce((s, l) => s + l.loadedMiles, 0)
      const empty = loads.reduce((s, l) => s + l.deadheadMiles, 0)
      const gross = loads.reduce((s, l) => s + l.rate, 0)
      let net: number | null = loads.length ? 0 : null
      for (const l of loads) {
        let b: Breakdown | null = null
        try {
          b = calcLoad(l, truck)
        } catch {
          b = null
        }
        net = b && net != null ? net + b.net : null
      }
      const service = input.maintenance.filter((m) => m.truckId === truck.id)
      return {
        truck,
        loads,
        days: busy,
        loaded,
        empty,
        gross,
        rpm: loaded + empty > 0 ? gross / (loaded + empty) : null,
        net,
        service,
        serviceCost: service.reduce((s, m) => s + (m.cost ?? 0), 0),
      }
    })
    .sort((a, b) => b.gross - a.gross || a.truck.id - b.truck.id)
}

// ---------- Письмо ----------

const C = {
  ink: '#1f2937',
  sub: '#6b7280',
  faint: '#9ca3af',
  line: '#e5e7eb',
  bg: '#f6f7f9',
  card: '#ffffff',
  accent: '#f97316',
  accentSoft: '#fed7aa',
  empty: '#cbd5e1',
  good: '#16a34a',
  warn: '#d97706',
  bad: '#dc2626',
  off: '#f1f5f9',
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`
const miles = (n: number) => Math.round(n).toLocaleString('en-US')
const mmdd = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}`
const mmddyy = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(2, 4)}`
const DOW = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

const truckLabel = (t: TruckRecord) => t.number?.trim() || t.name
/** «IN» из «EVANSVILLE, IN»; город без штата — как есть, коротко. */
const placeShort = (p: string | null) => {
  const s = (p ?? '').trim()
  if (!s) return '—'
  const m = s.match(/^([^,]+),\s*([A-Z]{2})\b/)
  return m ? `${m[1]!.trim().replace(/\b\w+/g, (w) => w[0]! + w.slice(1).toLowerCase())}, ${m[2]}` : s.slice(0, 28)
}

const css = (w: number | string) => (typeof w === 'number' ? `${w}px` : w)

/** Полоса: доля pct из 100, цветом color, на сером. */
function bar(pct: number, color: string, width: number | string = '100%', height = 8, rest = C.off): string {
  const p = Math.max(0, Math.min(100, Math.round(pct)))
  const left = p === 0 ? '' : `<td style="width:${p}%;background:${color};height:${height}px;line-height:${height}px;font-size:0;border-radius:4px 0 0 4px">&nbsp;</td>`
  const right = p === 100 ? '' : `<td style="background:${rest};height:${height}px;line-height:${height}px;font-size:0">&nbsp;</td>`
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:${css(width)};max-width:120px;border-collapse:collapse;border-radius:4px;overflow:hidden"><tr>${left}${right}</tr></table>`
}

/** Две полосы подряд — гружёные и порожние мили одной шкалой. */
function milesBar(loaded: number, empty: number, max: number, width: number | string = '100%'): string {
  if (max <= 0) return bar(0, C.accent, width)
  const a = Math.round((loaded / max) * 100)
  const b = Math.round((empty / max) * 100)
  const cells = [
    a > 0 ? `<td style="width:${a}%;background:${C.accent};height:8px;font-size:0">&nbsp;</td>` : '',
    b > 0 ? `<td style="width:${b}%;background:${C.empty};height:8px;font-size:0">&nbsp;</td>` : '',
    a + b < 100 ? `<td style="background:${C.off};height:8px;font-size:0">&nbsp;</td>` : '',
  ].join('')
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:${css(width)};max-width:120px;border-collapse:collapse"><tr>${cells}</tr></table>`
}

/** Неделя трака клетками: оранжевая — под грузом, серая — стоял. */
function dayStrip(days: boolean[]): string {
  const cells = days
    .map(
      (on, i) =>
        `<td title="${DOW[i]}" style="width:11px;height:12px;background:${on ? C.accent : C.off};border:1px solid ${C.card};font-size:0;border-radius:3px">&nbsp;</td>`,
    )
    .join('')
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:separate"><tr>${cells}</tr></table>`
}

const th = (s: string, align = 'left') =>
  `<th style="text-align:${align};font-weight:600;font-size:11px;color:${C.sub};text-transform:uppercase;letter-spacing:.03em;padding:6px 5px;border-bottom:1px solid ${C.line};white-space:nowrap">${s}</th>`
const td = (s: string, align = 'left', extra = '') =>
  `<td style="text-align:${align};font-size:13px;color:${C.ink};padding:7px 5px;border-bottom:1px solid ${C.line};vertical-align:middle;${extra}">${s}</td>`

function tile(label: string, value: string, sub = ''): string {
  return `<div style="display:inline-block;vertical-align:top;width:47%;max-width:160px;min-width:140px;margin:3px;background:${C.card};border:1px solid ${C.line};border-radius:10px;padding:10px 12px;box-sizing:border-box">
<div style="font-size:11px;color:${C.sub};text-transform:uppercase;letter-spacing:.03em">${label}</div>
<div style="font-size:20px;font-weight:700;color:${C.ink};margin-top:2px">${value}</div>
<div style="margin-top:6px;height:14px">${sub}</div></div>`
}

function section(title: string, body: string): string {
  return `<tr><td style="padding:18px 0 6px;font-size:15px;font-weight:700;color:${C.ink}">${title}</td></tr>
<tr><td style="background:${C.card};border:1px solid ${C.line};border-radius:10px;padding:4px 6px">${body}</td></tr>`
}

const KIND_RU: Record<string, string> = { oil: 'Масло', repair: 'Ремонт', service: 'Сервис', inspection: 'Осмотр' }

export type BuiltReport = { subject: string; html: string; text: string }

export function buildReport(input: ReportInput): BuiltReport {
  const { week } = input
  const rows = truckWeeks(input)
  const active = rows.filter((r) => r.loads.length > 0)
  const loads = active.flatMap((r) => r.loads)
  const gross = rows.reduce((s, r) => s + r.gross, 0)
  const loaded = rows.reduce((s, r) => s + r.loaded, 0)
  const empty = rows.reduce((s, r) => s + r.empty, 0)
  const rpm = loaded + empty > 0 ? gross / (loaded + empty) : null
  const netKnown = active.every((r) => r.net != null)
  const net = active.reduce((s, r) => s + (r.net ?? 0), 0)
  const serviceCost = input.maintenance.reduce((s, m) => s + (m.cost ?? 0), 0)
  const period = `${mmddyy(week.from)} – ${mmddyy(week.to)}`
  const url = input.appUrl.replace(/\/$/, '')

  const maxGross = Math.max(1, ...rows.map((r) => r.gross))
  const maxMiles = Math.max(1, ...rows.map((r) => r.loaded + r.empty))

  // Шапка: четыре плитки, у каждой шкала, а не вторая цифра.
  const tiles = `<div style="font-size:0">
${tile('Гросс', money(gross), `<span style="font-size:11px;color:${C.sub}">${loads.length} груз${plural(loads.length)}</span>`)}
${tile('Прибыль*', active.length ? money(net) + (netKnown ? '' : '+') : '—', gross > 0 ? bar(Math.max(0, (net / gross) * 100), C.good, '100%', 6) : '')}
${tile('Мили', miles(loaded + empty), milesBar(loaded, empty, loaded + empty))}
${tile('RPM', rpm == null ? '—' : `$${rpm.toFixed(2)}`, `<span style="font-size:11px;color:${C.sub}">гросс ÷ все мили</span>`)}
</div>`

  // Траки: неделя клетками, мили и гросс полосами, масло шкалой.
  const truckTable = `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">
<tr>${th('Трак')}${th('Пн … Вс')}${th('Мили')}${th('Гросс')}${th('RPM', 'right')}${th('Масло')}</tr>
${rows
  .map((r) => {
    const oil = input.oil.get(r.truck.id)
    const odo = input.odometer.get(r.truck.id)
    const oilCell =
      oil && oil.pct != null && oil.left != null
        ? `${bar(oil.pct, oil.tone === 'bad' ? C.bad : oil.tone === 'warn' ? C.warn : C.good, '100%', 6)}<div style="font-size:11px;color:${oil.left < 0 ? C.bad : C.sub};margin-top:3px">${oil.left < 0 ? `перепробег ${miles(-oil.left)}` : `ещё ${miles(oil.left)} mi`}</div>`
        : `<span style="font-size:11px;color:${C.faint}">нет данных</span>`
    const status = r.truck.unavailable === 'repair' ? ' · в ремонте' : r.truck.unavailable === 'vacation' ? ' · отпуск' : ''
    return `<tr>
${td(`<a href="${url}/garage?truck=${r.truck.id}" style="color:${C.ink};text-decoration:none;font-weight:600">${esc(truckLabel(r.truck))}</a><div style="font-size:11px;color:${C.sub}">${esc(shortName(r.truck.driverName) || '—')}${status}${odo != null ? ` · ${miles(odo)} mi` : ''}</div>`)}
${td(dayStrip(r.days))}
${td(`${milesBar(r.loaded, r.empty, maxMiles)}<div style="font-size:11px;color:${C.sub};margin-top:3px">${miles(r.loaded + r.empty)}${r.empty > 0 ? ` <span style="color:${C.faint}">(${miles(r.empty)} пуст.)</span>` : ''}</div>`)}
${td(`${bar((r.gross / maxGross) * 100, C.accent, '100%', 6)}<div style="font-size:12px;font-weight:600;margin-top:3px">${r.gross ? money(r.gross) : '—'}</div>`)}
${td(r.rpm == null ? '—' : `$${r.rpm.toFixed(2)}`, 'right', 'font-weight:600')}
${td(oilCell)}
</tr>`
  })
  .join('')}
</table>
<div style="font-size:11px;color:${C.faint};padding:6px 8px">Клетка — день недели: оранжевая — под грузом. Мили: оранжевым гружёные, серым порожние.</div>`

  // Грузы по тракам.
  const loadTable = loads.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">
<tr>${th('Пикап')}${th('Трак')}${th('Маршрут')}${th('Мили', 'right')}${th('Ставка', 'right')}${th('RPM', 'right')}</tr>
${active
  .flatMap((r) =>
    r.loads.map((l) => {
      const all = l.loadedMiles + l.deadheadMiles
      return `<tr>
${td(mmdd(l.pickupDate!), 'left', `color:${C.sub};white-space:nowrap`)}
${td(esc(truckLabel(r.truck)), 'left', 'white-space:nowrap')}
${td(`<a href="${url}/loads/${l.id}" style="color:${C.ink};text-decoration:none">${esc(placeShort(l.origin))} → ${esc(placeShort(l.destination))}</a>${l.brokerName ? `<div style="font-size:11px;color:${C.sub}">${esc(l.brokerName)}${l.referenceId ? ` · #${esc(l.referenceId)}` : ''}</div>` : ''}`)}
${td(miles(all), 'right', 'white-space:nowrap')}
${td(money(l.rate), 'right', 'font-weight:600;white-space:nowrap')}
${td(all > 0 ? `$${(l.rate / all).toFixed(2)}` : '—', 'right')}
</tr>`
    }),
  )
  .join('')}
</table>`
    : `<div style="padding:10px 8px;font-size:13px;color:${C.sub}">Грузов с пикапом на этой неделе нет.</div>`

  // Обслуживание из «Гаража».
  const filesFor = (m: MaintenanceRecord) => input.files.filter((f) => f.maintenanceId === m.id).length + input.skipped.filter((f) => f.maintenanceId === m.id).length
  const truckById = new Map(input.trucks.map((t) => [t.id, t]))
  const service = [...input.maintenance].sort((a, b) => a.doneAt.localeCompare(b.doneAt) || (a.doneTime ?? '').localeCompare(b.doneTime ?? ''))
  const serviceTable = service.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">
<tr>${th('Дата')}${th('Трак')}${th('Что')}${th('Пробег', 'right')}${th('Сумма', 'right')}${th('📎', 'right')}</tr>
${service
  .map((m) => {
    const k = serviceKind(m)
    const color = k === 'oil' ? C.good : k === 'repair' ? C.bad : C.sub
    const n = filesFor(m)
    return `<tr>
${td(`${mmdd(m.doneAt)}${m.doneTime ? `<div style="font-size:11px;color:${C.sub}">${esc(m.doneTime)} ET</div>` : ''}`, 'left', 'white-space:nowrap')}
${td(esc(truckById.get(m.truckId) ? truckLabel(truckById.get(m.truckId)!) : '—'), 'left', 'white-space:nowrap')}
${td(`<span style="display:inline-block;font-size:10px;font-weight:700;color:${color};border:1px solid ${color};border-radius:9px;padding:0 6px;margin-right:4px">${KIND_RU[k]}</span>${esc(m.title)}${m.shop ? `<div style="font-size:11px;color:${C.sub}">${esc(m.shop)}</div>` : ''}`)}
${td(m.odometer != null ? miles(m.odometer) : '—', 'right', 'white-space:nowrap')}
${td(m.cost != null ? money(m.cost) : '—', 'right', 'font-weight:600;white-space:nowrap')}
${td(n ? String(n) : '—', 'right', `color:${n ? C.ink : C.faint}`)}
</tr>`
  })
  .join('')}
<tr>${td('<b>Итого</b>')}${td('')}${td(`${service.filter((m) => isOilRecord(m)).length} масло · ${service.filter((m) => serviceKind(m) === 'repair').length} ремонт`, 'left', `color:${C.sub}`)}${td('')}${td(`<b>${money(serviceCost)}</b>`, 'right')}${td('')}</tr>
</table>`
    : `<div style="padding:10px 8px;font-size:13px;color:${C.sub}">Записей в «Гараже» за неделю нет.</div>`

  // Вложения списком: что прикреплено и что не влезло.
  const fileRow = (f: ReportFile, attached: boolean) => {
    const t = f.truckId != null ? truckById.get(f.truckId) : undefined
    return `<tr>${td(attached ? '📎' : '⛔', 'left', 'width:18px')}${td(`${esc(f.title)}<div style="font-size:11px;color:${C.sub}">${t ? esc(truckLabel(t)) + ' · ' : ''}${Math.max(1, Math.round(f.sizeBytes / 1024))} КБ${attached ? '' : ' · не влез в письмо, открыть в TMS'}</div>`)}</tr>`
  }
  const filesBlock =
    input.files.length || input.skipped.length
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">${input.files.map((f) => fileRow(f, true)).join('')}${input.skipped.map((f) => fileRow(f, false)).join('')}</table>`
      : `<div style="padding:10px 8px;font-size:13px;color:${C.sub}">Чеков и счетов за неделю нет.</div>`

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:${C.bg};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${C.ink}">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:${C.bg}"><tr><td align="center" style="padding:16px 8px">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:680px">
<tr><td style="padding:4px 4px 10px">
<div style="font-size:12px;color:${C.accent};font-weight:700;letter-spacing:.04em;text-transform:uppercase">${esc(input.company)} · отчёт по тракам</div>
<div style="font-size:22px;font-weight:700;color:${C.ink};margin-top:2px">Неделя ${period}</div>
<div style="font-size:12px;color:${C.sub};margin-top:2px">Понедельник – воскресенье по ET · ${rows.length} трак${plural(rows.length)} · ${active.length} с грузами</div>
</td></tr>
<tr><td>${tiles}</td></tr>
${section('Траки', truckTable)}
${section(`Грузы · ${loads.length}`, loadTable)}
${section(`Обслуживание · ${money(serviceCost)}`, serviceTable)}
${section(`Чеки и счета · ${input.files.length + input.skipped.length}`, filesBlock)}
<tr><td style="padding:14px 4px;font-size:11px;color:${C.faint};line-height:1.5">
* Прибыль — оценка по карточкам траков (топливо, водитель, платёж, страховка, проценты), как «Прибыль недели» на «Сегодня».
Грузы — по дате пикапа, без заявок и отменённых. <a href="${url}/garage" style="color:${C.accent}">Открыть «Гараж»</a> · <a href="${url}/money?tab=weeks" style="color:${C.accent}">Деньги по неделям</a>
</td></tr>
</table></td></tr></table></body></html>`

  // Текстовая версия — для клиентов без HTML и для поиска по почте.
  const text = [
    `${input.company} — отчёт по тракам, неделя ${period}`,
    `Гросс ${money(gross)} · Мили ${miles(loaded + empty)} · RPM ${rpm == null ? '—' : '$' + rpm.toFixed(2)} · Грузов ${loads.length} · Обслуживание ${money(serviceCost)}`,
    '',
    ...rows.map((r) => `${truckLabel(r.truck)} (${shortName(r.truck.driverName) || '—'}): ${r.loads.length} груз., ${miles(r.loaded + r.empty)} mi, ${money(r.gross)}${r.rpm ? `, $${r.rpm.toFixed(2)}/mi` : ''}`),
    '',
    ...service.map((m) => `${mmdd(m.doneAt)} ${truckById.get(m.truckId) ? truckLabel(truckById.get(m.truckId)!) : ''} ${KIND_RU[serviceKind(m)]}: ${m.title}${m.cost != null ? ` — ${money(m.cost)}` : ''}`),
  ].join('\n')

  return { subject: `Отчёт по тракам · ${period} · ${money(gross)}`, html, text }
}

function plural(n: number): string {
  const d = n % 10
  const h = n % 100
  if (d === 1 && h !== 11) return ''
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return 'а'
  return 'ов'
}

/** Что прикрепить: всё по порядку, пока общий размер не дойдёт до limit (Gmail принимает
 * письмо до 25 МБ, base64 раздувает файлы на треть — отсюда 17 МБ сырых байт). */
export function pickAttachments(files: ReportFile[], limit = 17 * 1024 * 1024): { attach: ReportFile[]; skip: ReportFile[] } {
  const attach: ReportFile[] = []
  const skip: ReportFile[] = []
  let total = 0
  for (const f of files) {
    if (total + f.sizeBytes <= limit) {
      attach.push(f)
      total += f.sizeBytes
    } else skip.push(f)
  }
  return { attach, skip }
}

/** Получатели из настройки: через запятую, пробел или с новой строки; только похожие на адрес. */
export function parseRecipients(raw: string | null | undefined): string[] {
  const seen = new Set<string>()
  for (const p of (raw ?? '').split(/[\s,;]+/)) {
    const e = p.trim().toLowerCase()
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) seen.add(e)
  }
  return [...seen]
}

/** Имя вложения: подпись документа плюс расширение по типу файла, без запрещённых знаков. */
export function attachmentName(f: Pick<ReportFile, 'title' | 'mime' | 'id'>): string {
  const ext = /pdf/.test(f.mime) ? 'pdf' : /png/.test(f.mime) ? 'png' : /webp/.test(f.mime) ? 'webp' : /heic/.test(f.mime) ? 'heic' : /jpe?g/.test(f.mime) ? 'jpg' : ''
  const base = (f.title || `doc-${f.id}`).replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || `doc-${f.id}`
  return ext && !base.toLowerCase().endsWith(`.${ext}`) ? `${base}.${ext}` : base
}
