// Имя документа по единому правилу: тип, номер груза, брокер, трак, дата.
//
//   RATECON 38295964 TQL #1935 09-13-26.pdf
//   POD 2 of 3 620042 Tallgrass #1705 09-11-26.pdf
//   INVOICE INV-620042 Tallgrass #1705 09-11-26.pdf
//   REPAIR #1935 09-13-26.jpg
//
// Раньше имя было тем, с чем файл пришёл: «eyJDYXJy…=.pdf» из портала TQL, «IMG_2041.jpg»
// с телефона, «RATECON #1705 tg.pdf» из Telegram. В списке их не отличить, а скачанный
// файл непонятно чей. Модуль чистый: имя считается из данных, которые уже есть в базе,
// поэтому его можно пересчитать в любой момент (lib/doc-title.ts).
//
// Дата — день загрузки по восточному времени, в формате MM-DD-YY (косая черта в имени
// файла недопустима). В имени нет символов, на которые срабатывает фильтр хостинга
// (lib/upload-name.ts): только буквы, цифры, пробел, # . - _.

export type DocNameInput = {
  kind: string
  /** Текущее имя — из него берётся расширение. */
  title: string
  mime: string
  /** Номер остановки у POD промежуточной выгрузки. */
  stopSeq: number | null
  /** Сколько остановок у груза (2, если JSON остановок нет). */
  stopCount: number | null
  ref: string | null
  invoiceNumber: string | null
  broker: string | null
  truck: string | null
  uploadedAt: Date | string
}

const KIND: Record<string, string> = {
  ratecon: 'RATECON',
  driverinfo: 'DRIVERINFO',
  bol: 'BOL',
  seal: 'SEAL',
  pod: 'POD',
  invoice: 'INVOICE',
  insurance: 'INSURANCE',
  registration: 'REGISTRATION',
  repair: 'REPAIR',
  photo: 'PHOTO',
  other: 'DOC',
}

const MIME_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/gif': 'gif',
  'text/plain': 'txt',
}

const clean = (s: string) =>
  s
    .replace(/[^\p{L}\p{N} #._-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// Брокеры, которых все зовут аббревиатурой, а по первому слову не узнать.
const BROKER_ALIAS: [RegExp, string][] = [[/^total quality logistics/i, 'TQL']]

/** «Tallgrass Freight, Co.» → «Tallgrass»; «C.H. Robinson» → «CH Robinson»; «TQL» → «TQL». */
export function brokerShort(name: string | null): string {
  for (const [re, short] of BROKER_ALIAS) if (re.test((name ?? '').trim())) return short
  const words = (name ?? '')
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}&]/gu, ''))
    .filter(Boolean)
  if (!words.length) return ''
  const first = words[0]!
  return (first.length < 3 && words[1] ? `${first} ${words[1]}` : first).slice(0, 24)
}

export function extOf(title: string, mime: string): string {
  const fromTitle = /\.([A-Za-z0-9]{2,5})$/.exec(title.trim())?.[1]?.toLowerCase()
  const ext = fromTitle ?? MIME_EXT[(mime || '').split(';')[0]!.trim().toLowerCase()] ?? 'bin'
  return ext === 'jpeg' ? 'jpg' : ext
}

/** 09-13-26 по восточному времени. */
export function nameDate(at: Date | string): string {
  const d = at instanceof Date ? at : new Date(at)
  if (Number.isNaN(d.getTime())) return ''
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: '2-digit', day: '2-digit', year: '2-digit' })
    .formatToParts(d)
    .reduce<Record<string, string>>((acc, x) => ((acc[x.type] = x.value), acc), {})
  return `${p.month}-${p.day}-${p.year}`
}

const LABELS = Object.values(KIND).join('|')
/** Имя, уже собранное этим правилом: «POD 620042 Tallgrass #1705 09-11-26 - описание.pdf». */
const OURS = new RegExp(`^(${LABELS})\\b.*?\\b\\d{2}-\\d{2}-\\d{2}(?: - (.+))?$`)

/**
 * Имя, в котором нет смысла для человека: камера и мессенджеры («IMG_2041»,
 * «WhatsApp Image 2026-09-10 at 13.45.18», «photo_2026-09-02»), порталы брокеров
 * («eyJDYXJy…», «doc1823302963»), прежние автоматические имена («BOL #1935 tg»,
 * «POD · 1935 · 2026-09-05», «INV-620042 packet»).
 */
export function isMachineName(stem: string): boolean {
  const s = stem.trim()
  if (!s) return true
  if (new RegExp(`^(${LABELS}|OTHER)\\b`, 'i').test(s)) return true
  if (/^INV-\S+ packet$/i.test(s)) return true
  if (/^(IMG|PXL|DSC|DCIM|MVIMG|VID|Screenshot|Screen Shot|CamScanner|scan|scanned|image|photo|picture|WhatsApp Image|doc|document|file|download|attachment|untitled)(?=$|[\s_\-\d(.])/i.test(s))
    return true
  // Длинный кусок без пробелов из букв и цифр — хеш, base64, номер из портала.
  const longest = s.split(/\s+/).reduce((m, w) => (w.length > m.length ? w : m), '')
  if (longest.length >= 20 && /\d/.test(longest) && /[A-Za-z]/.test(longest)) return true
  return /^[\d\s_\-().]+$/.test(s)
}

/** Описание из прежнего имени — только осмысленное; у нашего имени — хвост после « - ». */
function describe(title: string): string {
  const stem = title.trim().replace(/\.[A-Za-z0-9]{2,5}$/, '')
  const ours = OURS.exec(stem)
  if (ours) return ours[2] ? clean(ours[2]) : ''
  return isMachineName(stem) ? '' : clean(stem).slice(0, 40).trim()
}

// Тип, по которому документ ясен без слов: рейт-кон груза — это рейт-кон груза.
const SELF_EXPLANATORY = new Set(['ratecon', 'driverinfo', 'bol', 'pod', 'invoice'])

export function docName(d: DocNameInput): string {
  const kind = KIND[d.kind] ?? 'DOC'
  const stop =
    d.kind === 'pod' && d.stopSeq != null && (d.stopCount ?? 0) > 2 ? `${d.stopSeq} of ${d.stopCount}` : ''
  const ref = d.kind === 'invoice' && d.invoiceNumber ? d.invoiceNumber : d.ref
  const parts = [
    kind,
    stop,
    ref ? clean(ref).replace(/\s+/g, '').slice(0, 24) : '',
    ref || d.kind === 'invoice' ? brokerShort(d.broker) : '',
    d.truck ? `#${clean(d.truck).replace(/\s+/g, '')}` : '',
    nameDate(d.uploadedAt),
  ]
  // Описание из исходного имени не выбрасывается там, где тип сам ничего не говорит
  // («чек за ремонт» — а что чинили?) или документ ни к какому грузу не привязан.
  const desc = !ref || !SELF_EXPLANATORY.has(d.kind) ? describe(d.title) : ''
  return `${clean(parts.filter(Boolean).join(' '))}${desc ? ` - ${desc}` : ''}.${extOf(d.title, d.mime)}`
}
