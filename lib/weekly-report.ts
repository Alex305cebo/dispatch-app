// Недельный отчёт по тракам: собрать из базы, сложить письмом (lib/weekly-report-core.ts)
// и отправить через Gmail владельца.
//
// Кто запускает. По воскресеньям — .github/workflows/weekly-report.yml (бесплатное
// расписание GitHub, в базу ходит тем же секретом MYSQL_URL, что и сбор ставок);
// вручную — кнопка «Отправить сейчас» в Админке. Оба пути — эта функция, поэтому
// импорты здесь с .ts и без '@/': скрипт расписания запускает файл голым Node.
//
// Почта — SMTP Gmail с паролем приложения (бесплатно). Адрес и пароль вводит владелец
// в Админке, они лежат в settings, как ключи Gemini/FMCSA; в коде и логах их нет.
// Писать можно только на адреса из настройки report_emails — никому больше.

import { existsSync } from 'node:fs'
import nodemailer from 'nodemailer'
import { sql } from './db.ts'
import { getSetting, setSetting } from './settings.ts'
import { rowToLoad, rowToTruck, type LoadRow, type TruckRow } from './map.ts'
import { oilCard, type MaintenanceRecord, type TruckMeta } from './maintenance-core.ts'
import { todayEt } from './payments.ts'
import {
  attachmentName,
  buildReport,
  isDue,
  parseRecipients,
  pickAttachments,
  reportWeek,
  type BuiltReport,
  type ReportFile,
  type ReportWeek,
} from './weekly-report-core.ts'

const COMPANY = 'default'

/** Получатели по умолчанию — владелец назвал их 10/22/26. Меняются в Админке. */
export const DEFAULT_RECIPIENTS = 'mayalogisticscorp@gmail.com, dersire.der@gmail.com'

export const REPORT_KEYS = {
  to: 'report_emails',
  user: 'report_smtp_user',
  pass: 'report_smtp_pass',
  last: 'report_last',
  /** Последние отправки, новые сверху — история в Админке. */
  log: 'report_log',
  /** '0' — расписание выключено (кнопка «Отправить сейчас» работает всегда). */
  enabled: 'report_enabled',
  /** День (Вс=0 … Сб=6) и час ET отправки. По умолчанию воскресенье 18:00. */
  day: 'report_day',
  hour: 'report_hour',
} as const

export const DEFAULT_DAY = 0
export const DEFAULT_HOUR = 18
const LOG_SIZE = 15

export type LastSend = { week: string; at: string; ok: boolean; to: number; files: number; error?: string; manual?: boolean }

export type ReportStatus = {
  to: string
  user: string
  passSet: boolean
  last: LastSend | null
  log: LastSend[]
  enabled: boolean
  day: number
  hour: number
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export async function reportStatus(): Promise<ReportStatus> {
  const [to, user, pass, last, log, enabled, day, hour] = await Promise.all(
    [REPORT_KEYS.to, REPORT_KEYS.user, REPORT_KEYS.pass, REPORT_KEYS.last, REPORT_KEYS.log, REPORT_KEYS.enabled, REPORT_KEYS.day, REPORT_KEYS.hour].map((k) =>
      getSetting(k, COMPANY),
    ),
  )
  const lastSend = parseJson<LastSend | null>(last, null)
  const history = parseJson<LastSend[]>(log, [])
  const d = Number(day)
  const h = Number(hour)
  return {
    to: to ?? DEFAULT_RECIPIENTS,
    // Отправитель по умолчанию — почта компании; пароль приложения — от неё же.
    user: user ?? 'mayalogisticscorp@gmail.com',
    passSet: !!pass?.trim(),
    last: lastSend,
    // До истории была одна последняя отправка — она и становится первой строкой.
    log: history.length ? history : lastSend ? [lastSend] : [],
    enabled: enabled !== '0',
    day: day != null && Number.isInteger(d) && d >= 0 && d <= 6 ? d : DEFAULT_DAY,
    hour: hour != null && Number.isInteger(h) && h >= 0 && h <= 23 ? h : DEFAULT_HOUR,
  }
}

/** Записать попытку: последняя — отдельно (по ней расписание), и в историю сверху. */
async function record(entry: LastSend, prior: LastSend[]): Promise<void> {
  await setSetting(REPORT_KEYS.last, JSON.stringify(entry))
  await setSetting(REPORT_KEYS.log, JSON.stringify([entry, ...prior].slice(0, LOG_SIZE)))
}

const etHour = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' })

/** Полночь дня iso по ET как момент UTC (в базе время в UTC). Летом это 04:00Z, зимой 05:00Z. */
function etMidnight(iso: string): Date {
  for (const h of [4, 5]) {
    const d = new Date(`${iso}T0${h}:00:00Z`)
    if (Number(etHour.format(d)) === 0) return d
  }
  return new Date(`${iso}T05:00:00Z`)
}

function nextDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

const asDate = (v: unknown): string => (!v ? '' : v instanceof Date ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}` : String(v).slice(0, 10))

/* eslint-disable @typescript-eslint/no-explicit-any */
const recordOf = (r: any): MaintenanceRecord => ({
  id: r.id,
  truckId: r.truck_id,
  kind: r.kind,
  title: r.title,
  notes: r.notes,
  cost: r.cost,
  odometer: r.odometer,
  doneAt: asDate(r.done_at),
  doneTime: r.done_time ?? null,
  shop: r.shop ?? null,
  isOil: !!r.is_oil,
})

const fileOf = (r: any): ReportFile => ({
  id: r.id,
  truckId: r.truck_id ?? null,
  maintenanceId: r.maintenance_id ?? null,
  kind: r.kind,
  title: r.title,
  mime: r.mime,
  sizeBytes: r.size_bytes,
  uploadedAt: new Date(r.uploaded_at).toISOString(),
})

/** Всё для письма за неделю week. Файлы — только описания; сами байты читает send. */
export async function collectReport(week: ReportWeek, appUrl: string): Promise<{ built: BuiltReport; attach: ReportFile[] }> {
  // Момент строкой UTC: Date драйвер перевёл бы в пояс процесса, а он у GitHub и хостинга разный.
  const utc = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ')
  const start = utc(etMidnight(week.from))
  const end = utc(etMidnight(nextDay(week.to)))
  // Грузы — с запасом на неделю назад: рейс, начатый в прошлое воскресенье, занимает
  // клетки этой недели, хотя в её грузы не входит.
  const [truckRows, loadRows, maintRows, metaRows, fleetRows, allMaint, docRows, coName] = await Promise.all([
    sql`SELECT * FROM trucks WHERE company_id = ${COMPANY} ORDER BY id`,
    sql`SELECT * FROM loads WHERE company_id = ${COMPANY} AND pickup_date >= DATE_SUB(${week.from}, INTERVAL 14 DAY)
          AND pickup_date <= ${week.to}`,
    sql`SELECT m.* FROM truck_maintenance m JOIN trucks t ON t.id = m.truck_id
        WHERE t.company_id = ${COMPANY} AND m.done_at >= ${week.from} AND m.done_at <= ${week.to}`,
    sql`SELECT m.truck_id, m.oil_interval_mi, m.oil_last_odometer FROM truck_meta m JOIN trucks t ON t.id = m.truck_id
        WHERE t.company_id = ${COMPANY}`,
    sql`SELECT unit, odometer FROM fleet_status`,
    // Для масла нужна последняя замена за всё время, не только за неделю.
    sql`SELECT m.* FROM truck_maintenance m JOIN trucks t ON t.id = m.truck_id WHERE t.company_id = ${COMPANY}`,
    // Чеки и счета недели: прикреплённые к записям журнала этой недели и бумаги трака
    // без груза и записи (их грузят через «Документы» трака), загруженные за неделю.
    sql`SELECT d.id, d.truck_id, d.maintenance_id, d.kind, d.title, d.mime, d.size_bytes, d.uploaded_at
        FROM documents d LEFT JOIN truck_maintenance m ON m.id = d.maintenance_id
        WHERE d.company_id = ${COMPANY} AND d.deleted_at IS NULL AND (
          (m.done_at >= ${week.from} AND m.done_at <= ${week.to})
          OR (d.maintenance_id IS NULL AND d.load_id IS NULL AND d.truck_id IS NOT NULL
              AND d.kind IN ('repair', 'invoice', 'photo', 'other')
              AND d.uploaded_at >= ${start} AND d.uploaded_at < ${end}))
        ORDER BY d.uploaded_at`,
    getSetting('co_name', COMPANY),
  ])
  const trucks = (truckRows as TruckRow[]).map(rowToTruck)
  const loads = (loadRows as LoadRow[]).map(rowToLoad)
  const maintenance = maintRows.map(recordOf)
  const history = allMaint.map(recordOf)
  const metas = new Map(
    (metaRows as any[]).map((r) => [r.truck_id as number, { oilIntervalMi: r.oil_interval_mi, oilLastOdometer: r.oil_last_odometer } as Pick<TruckMeta, 'oilIntervalMi' | 'oilLastOdometer'>]),
  )
  const eld = new Map((fleetRows as any[]).map((r) => [String(r.unit), r.odometer as number | null]))
  const odometer = new Map<number, number | null>()
  const oil = new Map<number, ReturnType<typeof oilCard>>()
  for (const tr of trucks) {
    const recs = history.filter((m) => m.truckId === tr.id)
    // Пробег — как в «Гараже»: ELD, а без него наибольший из журнала.
    const logOdo = recs.reduce<number | null>((a, r) => (r.odometer != null && (a == null || r.odometer > a) ? r.odometer : a), null)
    const odo = (tr.number ? eld.get(tr.number.trim()) : null) ?? logOdo
    odometer.set(tr.id, odo ?? null)
    oil.set(tr.id, oilCard(recs, metas.get(tr.id) ?? null, odo ?? null))
  }
  const files = docRows.map(fileOf)
  const { attach, skip } = pickAttachments(files)
  const built = buildReport({
    week,
    company: coName?.trim() || 'TMS',
    appUrl,
    trucks,
    loads,
    maintenance,
    odometer,
    oil,
    files: attach,
    skipped: skip,
  })
  return { built, attach }
}

export type SendResult =
  | { ok: true; week: string; to: number; files: number }
  | { ok: false; skipped: true; week: string; reason: string }
  | { ok: false; error: string; week: string }

/** Собрать и отправить. force=false (расписание) — неделя уходит один раз; кнопка шлёт всегда. */
export async function sendWeeklyReport(opts: { force?: boolean; today?: string; appUrl?: string } = {}): Promise<SendResult> {
  const week = reportWeek(opts.today ?? todayEt())
  const status = await reportStatus()
  // Уже ушла неделя — по истории, а не только по последней строке: ручная отправка
  // другой недели не должна вызывать повтор по расписанию.
  if (!opts.force && status.log.some((e) => e.ok && e.week === week.from)) {
    return { ok: false, skipped: true, week: week.from, reason: 'already sent' }
  }
  const to = parseRecipients(status.to)
  const pass = ((await getSetting(REPORT_KEYS.pass, COMPANY)) ?? '').replace(/\s+/g, '')
  const user = status.user.trim()
  const fail = async (error: string): Promise<SendResult> => {
    await record({ week: week.from, at: new Date().toISOString(), ok: false, to: to.length, files: 0, error, manual: !!opts.force }, status.log)
    return { ok: false, error, week: week.from }
  }
  if (!to.length) return fail('Нет адресов получателей.')
  // Без пароля Gmail — почтой самого сервера (sendmail хостинга): владелец не хочет
  // заводить пароль (10/22/26). Пароль остаётся запасным путём, если письма не доходят.
  const gmail = !!(user && pass)
  const sendmail = gmail ? null : SENDMAIL_PATHS.find((p) => existsSync(p))
  if (!gmail && !sendmail) return fail('На сервере нет почты (sendmail). Нужен пароль приложения Gmail.')

  try {
    const { built, attach } = await collectReport(week, opts.appUrl ?? 'https://app.mayalogisticsinc.com')
    const blobs = attach.length
      ? ((await sql`SELECT id, data FROM documents WHERE id IN (${attach.map((f) => f.id)})`) as { id: number; data: Buffer }[])
      : []
    const byId = new Map(blobs.map((b) => [b.id, b.data]))
    const used = new Set<string>()
    const attachments = attach
      .filter((f) => byId.has(f.id))
      .map((f) => {
        // Одинаковые подписи («Receipt») — номер в скобках, иначе почта покажет два одинаковых файла.
        let name = attachmentName(f)
        for (let i = 2; used.has(name.toLowerCase()); i++) name = attachmentName({ ...f, title: `${f.title} (${i})` })
        used.add(name.toLowerCase())
        return { filename: name, content: Buffer.from(byId.get(f.id)!), contentType: f.mime }
      })
    const transport = gmail
      ? nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass } })
      : nodemailer.createTransport({ sendmail: true, newline: 'unix', path: sendmail! })
    await transport.sendMail({
      from: { name: 'TMS · отчёт по тракам', address: gmail ? user : senderFor(opts.appUrl) },
      // Ответ на письмо с сервера — в почту компании, а не в никуда.
      ...(gmail ? {} : { replyTo: to[0] }),
      to,
      subject: built.subject,
      html: built.html,
      text: built.text,
      attachments,
    })
    await record({ week: week.from, at: new Date().toISOString(), ok: true, to: to.length, files: attachments.length, manual: !!opts.force }, status.log)
    return { ok: true, week: week.from, to: to.length, files: attachments.length }
  } catch (e) {
    const err = e as { code?: string; responseCode?: number; message?: string }
    // Gmail отвечает 535 на неверный пароль приложения — это говорим прямо, остальное коротко.
    const msg =
      err.responseCode === 535 || err.code === 'EAUTH'
        ? 'Gmail не принял адрес или пароль приложения.'
        : `Не отправилось: ${String(err.message ?? e).slice(0, 160)}`
    return fail(msg)
  }
}

const SENDMAIL_PATHS = ['/usr/sbin/sendmail', '/usr/lib/sendmail', '/usr/bin/sendmail']

/** Адрес отправителя с сервера: noreply@ домена сайта (app.mayalogisticsinc.com → mayalogisticsinc.com). */
function senderFor(appUrl: string | undefined): string {
  let host = 'mayalogisticsinc.com'
  try {
    host = new URL(appUrl ?? `https://${host}`).hostname.split('.').slice(-2).join('.') || host
  } catch {
    /* оставляем домен по умолчанию */
  }
  return `noreply@${host}`
}

/** Расписание без отдельного планировщика: зовётся из /api/eld-poll (внешний пингер раз в
 * 5 минут) и после открытия «Сегодня». Неделя уходит в день и час из Админки (по
 * умолчанию воскресенье 18:00 ET), один раз; после неудачи — повтор не раньше чем через
 * 6 часов, чтобы не долбить почту. Выключено в Админке — не шлёт. */
let sending: Promise<unknown> | null = null
export async function maybeSendWeeklyReport(appUrl?: string): Promise<void> {
  if (sending) return
  const now = new Date()
  const today = todayEt(now)
  const week = reportWeek(today)
  const st = await reportStatus()
  if (!st.enabled || !isDue(week, st.day, st.hour, today, Number(etHour.format(now)))) return
  if (st.log.some((e) => e.week === week.from && !e.manual && (e.ok || now.getTime() - Date.parse(e.at) < 6 * 3_600_000))) return
  if (st.log.some((e) => e.week === week.from && e.ok)) return
  sending = sendWeeklyReport({ today, appUrl }).catch(() => null).finally(() => (sending = null))
  await sending
}

/** Письмо как страница — посмотреть, не отправляя. */
export async function previewWeeklyReport(today = todayEt(), appUrl?: string): Promise<string> {
  const { built } = await collectReport(reportWeek(today), appUrl ?? 'https://app.mayalogisticsinc.com')
  return built.html
}
