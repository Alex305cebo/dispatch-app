// Документы водителя и трака (11/10/26): права (CDL), медкарта, регистрация трака
// (cab card), регистрация трейлера, страховка, годовая инспекция, пермиты, договор,
// инструкции. Живут в той же таблице documents (truck_id, без груза) с колонкой paper —
// так они видны и в «Документах», и в карточке трака, а не в отдельном хранилище.
//
// Пять сроков (CDL, медкарта, регистрация, страховка, инспекция) уже были колонками
// truck_meta: по ним горят предупреждения в «Траках», «Гараже» и при назначении груза.
// Срок этих бумаг пишется туда же — одна правда на всё приложение. У остальных типов
// срок лежит на самом документе (documents.expires_on).
//
// Модуль чистый: типы, подписи и расчёт «сколько дней осталось» — без базы, для тестов.

export const PAPER_TYPES = [
  'cdl',
  'medcard',
  'truck_reg',
  'trailer_reg',
  'insurance',
  'inspection',
  'permit',
  'lease',
  'instructions',
  'other',
] as const

export type PaperType = (typeof PAPER_TYPES)[number]

export function isPaperType(v: unknown): v is PaperType {
  return typeof v === 'string' && (PAPER_TYPES as readonly string[]).includes(v)
}

/** Тип документа в общей таблице (documents.kind) — CHECK там не трогаем. */
export const PAPER_KIND: Record<PaperType, 'registration' | 'insurance' | 'other'> = {
  cdl: 'other',
  medcard: 'other',
  truck_reg: 'registration',
  trailer_reg: 'registration',
  insurance: 'insurance',
  inspection: 'other',
  permit: 'other',
  lease: 'other',
  instructions: 'other',
  other: 'other',
}

/** Срок, который живёт колонкой truck_meta (и уже горит по всему приложению). */
export const PAPER_META_COLUMN: Partial<Record<PaperType, MetaDateKey>> = {
  cdl: 'cdlExpiry',
  medcard: 'medcardExpiry',
  truck_reg: 'registrationExpiry',
  insurance: 'insuranceExpiry',
  inspection: 'inspectionExpiry',
}

export type MetaDateKey = 'cdlExpiry' | 'medcardExpiry' | 'registrationExpiry' | 'insuranceExpiry' | 'inspectionExpiry'

/** Имя колонки в SQL — только из этого списка, никогда из ввода. */
export const META_SQL_COLUMN: Record<MetaDateKey, string> = {
  cdlExpiry: 'cdl_expiry',
  medcardExpiry: 'medcard_expiry',
  registrationExpiry: 'registration_expiry',
  insuranceExpiry: 'insurance_expiry',
  inspectionExpiry: 'inspection_expiry',
}

/** У этих бумаг срока не бывает — поле даты не показываем. */
export const PAPER_NO_EXPIRY = new Set<PaperType>(['instructions'])

/** Обязательный набор: эти места видны всегда, даже пустые («＋ загрузить»). */
export const PAPER_CORE: PaperType[] = ['cdl', 'medcard', 'truck_reg', 'trailer_reg', 'insurance', 'inspection']

/** Группа на экране: водитель / машина / прочее. */
export const PAPER_GROUP: Record<PaperType, 'driver' | 'equipment' | 'other'> = {
  cdl: 'driver',
  medcard: 'driver',
  truck_reg: 'equipment',
  trailer_reg: 'equipment',
  insurance: 'equipment',
  inspection: 'equipment',
  permit: 'equipment',
  lease: 'other',
  instructions: 'other',
  other: 'other',
}

/** Метка в имени файла: «CDL #1935 11-10-26.pdf» (lib/doc-name.ts). */
export const PAPER_FILE_LABEL: Record<PaperType, string> = {
  cdl: 'CDL',
  medcard: 'MEDCARD',
  truck_reg: 'CABCARD',
  trailer_reg: 'TRAILER-REG',
  insurance: 'INSURANCE',
  inspection: 'INSPECTION',
  permit: 'PERMIT',
  lease: 'LEASE',
  instructions: 'INSTRUCTIONS',
  other: 'DRIVER-DOC',
}

/** Старые бумаги трака без paper: страховка и регистрация уже были своими kind. */
export function paperOf(row: { paper: string | null; kind: string }): PaperType | null {
  if (isPaperType(row.paper)) return row.paper
  if (row.kind === 'insurance') return 'insurance'
  if (row.kind === 'registration') return 'truck_reg'
  return null
}

export type ExpiryTone = 'good' | 'warn' | 'bad'

/** Дней от сегодня (ET, ISO-день) до срока; минус — просрочен. Считается по датам,
 * без времени суток и пояса процесса. */
export function daysUntil(dateIso: string, todayIso: string): number {
  const a = Date.UTC(+todayIso.slice(0, 4), +todayIso.slice(5, 7) - 1, +todayIso.slice(8, 10))
  const b = Date.UTC(+dateIso.slice(0, 4), +dateIso.slice(5, 7) - 1, +dateIso.slice(8, 10))
  return Math.round((b - a) / 86_400_000)
}

/** Те же пороги, что у expiries() (lib/maintenance-core.ts): ≤30 дней — красный,
 * ≤60 — жёлтый. Иначе одна и та же CDL горела бы в шапке и в «Траках» разным цветом. */
export function expiryTone(days: number): ExpiryTone {
  return days <= 30 ? 'bad' : days <= 60 ? 'warn' : 'good'
}

/** Длина полосы срока: год вперёд — полная, просрочен — пустая. */
export function expiryFill(days: number): number {
  return Math.max(0, Math.min(1, days / 365))
}

/** YYYY-MM-DD, реальная дата между 2000 и 2099 — или null. */
export function cleanIsoDate(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim())
  if (!m) return null
  const [y, mo, d] = [+m[1]!, +m[2]!, +m[3]!]
  if (y < 2000 || y > 2099) return null
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null
  return `${m[1]}-${m[2]}-${m[3]}`
}

/**
 * Срок из ответа модели: «2027-05-14», «05/14/2027», «05/14/27». Американский порядок
 * месяц/день — документы водителей США пишут дату так. «none» и прочее — null.
 */
export function parseModelDate(text: string): string | null {
  const s = text.trim()
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (iso) return cleanIsoDate(`${iso[1]}-${iso[2]}-${iso[3]}`)
  const us = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s)
  if (us) {
    const y = us[3]!.length === 2 ? 2000 + +us[3]! : +us[3]!
    return cleanIsoDate(`${y}-${us[1]!.padStart(2, '0')}-${us[2]!.padStart(2, '0')}`)
  }
  return null
}

/** Срок одного места: колонка truck_meta или самый свежий документ этого типа. */
export function slotExpiry(
  paper: PaperType,
  meta: Partial<Record<MetaDateKey, string | null>>,
  docs: { paper: PaperType; expiresOn: string | null; uploadedAt: string }[],
): string | null {
  const col = PAPER_META_COLUMN[paper]
  if (col) return meta[col] ?? null
  const withDate = docs
    .filter((d) => d.paper === paper && d.expiresOn)
    .sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1))
  return withDate[0]?.expiresOn ?? null
}
