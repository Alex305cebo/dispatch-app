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
]

export function captionKind(text: string): DocClass | null {
  const t = text.trim()
  if (!t) return null
  return CAPTION_KINDS.find(({ re }) => re.test(t))?.kind ?? null
}

// What the document calls ITSELF. Every one of these papers prints its own type at the
// top in big letters, so for a text PDF the answer is already in our hands — we extract
// the text anyway — and a vision call to name it is a wasted request. That matters on
// the free Gemini tier, where the daily allowance is counted in requests, not tokens.
//
// Order is not alphabetical and must not be: a rate con routinely says "invoice" in its
// payment terms and "bill of lading" in its instructions, so the most specific,
// self-declaring headings are tested first and the generic "invoice" last.
// Two regexes per kind, and the split is the point: the spelled-out heading is matched
// WITHOUT regard to case, because documents print it as "BILL OF LADING", "Bill of
// Lading" or "bill of lading" indifferently. The three-letter abbreviation is matched
// case-SENSITIVELY, because lowercase "pod" and "bol" live inside ordinary words —
// "pods", "bolted" — and a confidently mislabelled document is worse than an
// unlabelled one that falls through to the model.
const TEXT_KINDS: { kind: DocClass; phrase: RegExp; abbr?: RegExp }[] = [
  {
    kind: 'ratecon',
    phrase: /\brate[\s._-]*con(?:f|firmation)?\b|\b(?:load|carrier)[\s._-]*confirmation\b/i,
  },
  {
    kind: 'pod',
    phrase: /\bproof[\s._-]*of[\s._-]*delivery\b|\bdelivery[\s._-]*receipt\b/i,
    abbr: /\bPOD\b/,
  },
  {
    kind: 'bol',
    phrase: /\bbill[\s._-]*of[\s._-]*lading\b|\bstraight[\s._-]*bill\b/i,
    abbr: /\bBOL\b/,
  },
  { kind: 'invoice', phrase: /\binvoice\b/i },
]

/**
 * Classify a document from the text we already pulled out of it. Returns null when the
 * text says nothing recognisable — that's the only case that still needs the vision
 * model. Deliberately NOT case-insensitive on the POD/BOL abbreviations: lowercase
 * "pod" appears inside ordinary words and "bol" inside "bolt", and a mislabelled
 * document is worse than an unlabelled one.
 */
export function docKindFromText(text: string): DocClass | null {
  const t = (text ?? '').trim()
  if (t.length < 40) return null // too little to be a document's own text
  return TEXT_KINDS.find(({ phrase, abbr }) => phrase.test(t) || (abbr?.test(t) ?? false))?.kind ?? null
}
