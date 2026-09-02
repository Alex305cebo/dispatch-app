// Pure caption→document-kind matching, split out of tg-intake so it's testable
// without dragging in the server-only DB/Telegram modules. A Telegram caption is a
// trusted human label, so it FORCES the kind ahead of the vision classifier — e.g. a
// rate con posted with "Rate con updated" files straight onto the load.

import type { DocClass } from './ai-doc.ts'

// First match wins. Extend by adding rows (a BOL/POD keyword, an invoice one, etc.).
const CAPTION_KINDS: { kind: DocClass; re: RegExp }[] = [
  // \b before the English "rate" so "modeRATE CONcern" doesn't mis-file; left off the
  // Cyrillic side where JS \b (ASCII-only) treats every letter as a non-word char.
  // The separator class covers filenames, not just typed captions: brokers send
  // "rate_confirmation_88213.pdf" and "Rate-Con 4471.pdf", and an underscore used to
  // break the match outright — which is how a rate con got filed as "other".
  { kind: 'ratecon', re: /\brate[\s._-]*con(f|firmation)?|рейт[\s._-]*кон|рейткон/i },
  // Идёт ПОСЛЕ рейт-кона: у файла «Rate con + driver info.pdf» главное слово первое.
  {
    kind: 'driverinfo',
    // (?![a-z]) вместо \b на конце: в именах файлов дальше идёт «_sheet», а
    // подчёркивание для \b — обычная буква, и «driver_information_sheet.pdf» не
    // совпадал. Ровно так названия и приходят от брокеров.
    re: /\bdriver[\s._-]*info(?:rmation)?(?![a-z])|\bcarrier[\s._-]*info(?:rmation)?[\s._-]*sheet(?![a-z])|инфо[\s._-]*водител/i,
  },
]

export function captionKind(text: string): DocClass | null {
  const t = text.trim()
  if (!t) return null
  return CAPTION_KINDS.find(({ re }) => re.test(t))?.kind ?? null
}

// What the document calls ITSELF. A rate con prints its type across the top, and for a
// text PDF that text is already in our hands — we extract it anyway — so a vision call
// to name it is a wasted request. That matters on the free Gemini tier, where the daily
// allowance is counted in requests, not tokens.
//
// ONLY rate cons are recognised from text, and that asymmetry is deliberate.
//
// A rate con names the other document types inside its own terms — "submit your
// invoice to…", "return the signed bill of lading", "POD with signature required" —
// so matching those words would relabel rate cons as invoices and BOLs whenever the
// heading is non-standard ("Load Tender", "Rate Agreement"). The load would silently
// never be created and nobody would know why.
//
// Getting it wrong here is far more expensive than not knowing: an unrecognised
// document falls through to the vision model and still gets classified correctly,
// costing one request. So this list answers only the question it can answer safely,
// for the case that carries the volume.
const RATECON_TEXT = /\brate[\s._-]*con(?:f|firmation)?\b|\b(?:load|carrier)[\s._-]*confirmation\b/i

/** Лист с данными для водителя называет себя так же прямо, как рейт-кон. Отличать
 * его текстом важно вдвойне: ставки в нём нет, и попытка сделать из него груз
 * заканчивается ошибкой «нет ставки» — а документ при этом нужный и подшивается к
 * тому же грузу. */
const DRIVERINFO_TEXT = /\bdriver\s*\/?\s*carrier\s+information\s+sheet\b|\bdriver\s+information\s+sheet\b|\bcarrier\s+information\s+sheet\b/i

/**
 * 'ratecon' when the document says so about itself, null otherwise — and null means
 * "ask the model", never "not a rate con". Every uncertain document still gets its
 * proper answer from vision; this only skips the request when the paper has already
 * answered in its own heading.
 */
/** Сумма денег в тексте: «$2,050», «$ 2050.00», «USD 2,050», «Rate: 2050.00». */
const MONEY_TEXT = /(?:\$|\bUSD\b)\s?\d{2,3}(?:,\d{3})*(?:\.\d{2})?|\b(?:rate|total|linehaul|carrier\s+pay)\b[^\n$]{0,20}\d{3,6}(?:\.\d{2})?/i

export function docKindFromText(text: string): DocClass | null {
  const t = (text ?? '').trim()
  if (t.length < 40) return null // too little to be a document's own text
  // Что решает — ДЕНЬГИ. Рейт-кон всегда называет ставку ($2,050 / Rate: $…), лист
  // водителя по определению её не содержит. У TQL сам рейт-кон включает раздел
  // «Carrier Information Sheet», и слепая проверка листа раньше рейт-кона делала из
  // настоящего рейт-кона «Driver Info» — груз не создавался. А лист водителя может
  // упомянуть «see the rate confirmation» без единой суммы — и он остаётся листом.
  const money = MONEY_TEXT.test(t)
  if (RATECON_TEXT.test(t) && money) return 'ratecon'
  if (DRIVERINFO_TEXT.test(t)) return 'driverinfo'
  return RATECON_TEXT.test(t) ? 'ratecon' : null
}
