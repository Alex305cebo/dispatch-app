// «Распознать чек» в «Гараже» (10/22/26): фото или PDF чека, счёта или заказ-наряда из
// сервиса → готовая запись журнала. Здесь — что спросить у модели и как её ответ стать
// записью: перевод времени в ET и поиск трака по номеру юнита, номеру машины или VIN.
// Без базы и сети — для тестов и для клиента.

export type ScanAnswer = {
  kind: 'oil' | 'repair' | 'service' | 'inspection'
  title: string | null
  details: string | null
  date: string | null
  time: string | null
  timezone: string | null
  shop: string | null
  odometer: number | null
  odometerUnit: 'mi' | 'km' | null
  total: number | null
  unit: string | null
  plate: string | null
  vin: string | null
}

export const SCAN_SCHEMA = {
  type: 'OBJECT',
  properties: {
    kind: { type: 'STRING', enum: ['oil', 'repair', 'service', 'inspection'] },
    title: { type: 'STRING', nullable: true },
    details: { type: 'STRING', nullable: true },
    date: { type: 'STRING', nullable: true },
    time: { type: 'STRING', nullable: true },
    timezone: { type: 'STRING', nullable: true },
    shop: { type: 'STRING', nullable: true },
    odometer: { type: 'NUMBER', nullable: true },
    odometerUnit: { type: 'STRING', enum: ['mi', 'km'], nullable: true },
    total: { type: 'NUMBER', nullable: true },
    unit: { type: 'STRING', nullable: true },
    plate: { type: 'STRING', nullable: true },
    vin: { type: 'STRING', nullable: true },
  },
  required: ['kind'],
}

const LANG: Record<string, string> = { ru: 'Russian', en: 'English', es: 'Spanish', uk: 'Ukrainian', ro: 'Romanian', kk: 'Kazakh' }

export function scanPrompt(locale: string): string {
  const lang = LANG[locale] ?? 'English'
  return `You are reading a document about servicing a commercial truck in the US: a shop invoice, work order, receipt or inspection report. It can be a photo of paper, a screenshot or a PDF, from any shop, in any layout. Extract ONLY what is printed. Use null for anything not present — never guess.

Fields:
- kind: "oil" if the main job is an engine oil change / PM service with engine oil; "inspection" for DOT/annual/state inspections; "repair" for fixing something broken (brakes, tires replaced after damage, lights, A/C, engine, electrical, body); "service" for other routine maintenance (tires rotation, grease only, DPF cleaning, alignment, washing).
- title: 2–6 words in ${lang} naming the main job, e.g. "Замена масла" / "Oil change", "Тормозные колодки".
- details: one short line in ${lang} listing the main work and parts (no prices), max 160 characters.
- date: service date as YYYY-MM-DD (the date the work was done or paid; US documents write MM/DD/YY).
- time: time of the service or payment as HH:MM in 24-hour format, exactly as printed (do not convert).
- timezone: the time zone abbreviation printed next to the time (ET, EST, EDT, CT, CST, CDT, MT, PT…), null if none.
- shop: shop name and its city with state code, e.g. "LubeZone Truck Lube Center, Sayre OK". The shop, NOT the fleet/customer.
- odometer: the vehicle odometer / mileage reading as a plain number. odometerUnit: "mi" or "km" as printed ("M", "mi", "miles" = mi).
- total: the final amount paid or due for the whole document (after tax and discounts), a number without "$".
- unit: the truck's fleet/unit number (Fleet ID, Unit #, Truck #) — not an order or invoice number.
- plate: the license plate without the state. vin: the VIN or its printed part (Identifier / Serial).`
}

/** Сдвиг пояса от ET в часах: CT на час позади, MT на два, PT на три. */
const ZONE_SHIFT: Record<string, number> = { E: 0, C: 1, M: 2, P: 3 }

/** Время из документа → ЧЧ:ММ по ET. Пояс не указан — считаем, что уже ET. */
export function toEt(time: string | null, zone: string | null): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(time?.trim() ?? '')
  if (!m) return null
  let h = Number(m[1])
  if (h > 23 || Number(m[2]) > 59) return null
  const z = zone?.trim().toUpperCase().match(/^([ECMP])[SD]?T$/)?.[1]
  if (z) h = (h + ZONE_SHIFT[z]!) % 24
  return `${String(h).padStart(2, '0')}:${m[2]}`
}

const norm = (s: string | null | undefined) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')

export type ScanTruck = { id: number; number: string | null; plate: string | null; vin: string | null }

/** Чей это чек: номер юнита → номер машины → VIN (полный или последние 6+ знаков). */
export function matchTruck(a: Pick<ScanAnswer, 'unit' | 'plate' | 'vin'>, trucks: ScanTruck[]): number | null {
  const unit = norm(a.unit).replace(/^0+/, '')
  if (unit) {
    const hit = trucks.find((tr) => norm(tr.number).replace(/^0+/, '') === unit)
    if (hit) return hit.id
  }
  const plate = norm(a.plate)
  if (plate.length >= 4) {
    const hit = trucks.find((tr) => norm(tr.plate).replace(/^[A-Z]{2}(?=[0-9A-Z]{4,}$)/, '') === plate || norm(tr.plate) === plate)
    if (hit) return hit.id
  }
  const vin = norm(a.vin)
  if (vin.length >= 6) {
    const hit = trucks.find((tr) => {
      const v = norm(tr.vin)
      return v.length >= 6 && (v === vin || v.endsWith(vin) || vin.endsWith(v.slice(-8)))
    })
    if (hit) return hit.id
  }
  return null
}

/** Ответ модели → поля окна записи (тип MaintenanceInput, без импорта actions). */
export function scanToInput(a: ScanAnswer) {
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(a.date ?? '') ? a.date! : null
  const odo = a.odometer != null && a.odometer > 0 ? Math.round(a.odometerUnit === 'km' ? a.odometer / 1.609344 : a.odometer) : null
  return {
    kind: a.kind,
    title: a.title?.trim() || '',
    notes: a.details?.trim() || '',
    cost: a.total != null && a.total >= 0 ? Math.round(a.total * 100) / 100 : null,
    odometer: odo,
    doneAt: iso,
    doneTime: toEt(a.time, a.timezone),
    shop: a.shop?.trim() || '',
  }
}

/** Подсказки из имени бумаги, которое ставит TMS: «REPAIR #1705 08-29-26 - Tire Steer 2.pdf»
 * → дата 2026-08-29 и «Tire Steer 2». Нужны, когда ИИ не ответил или не нашёл дату. */
export function titleHints(title: string): { doneAt: string | null; what: string | null } {
  const m = /^\s*[A-Z]+\s+#\S+\s+(\d{2})-(\d{2})-(\d{2})\s*(?:-\s*(.+?))?(?:\.[a-z0-9]{2,4})?\s*$/i.exec(title)
  if (!m) return { doneAt: null, what: title.replace(/\.[a-z0-9]{2,4}$/i, '').trim() || null }
  return { doneAt: `20${m[3]}-${m[1]}-${m[2]}`, what: m[4]?.trim() || null }
}
