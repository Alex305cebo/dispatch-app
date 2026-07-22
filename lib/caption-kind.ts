// Pure caption→document-kind matching, split out of tg-intake so it's testable
// without dragging in the server-only DB/Telegram modules. A Telegram caption is a
// trusted human label, so it FORCES the kind ahead of the vision classifier — e.g. a
// rate con posted with "Rate con updated" files straight onto the load.

import type { DocClass } from './ai-doc.ts'

// First match wins. Extend by adding rows (a BOL/POD keyword, an invoice one, etc.).
const CAPTION_KINDS: { kind: DocClass; re: RegExp }[] = [
  // \b before the English "rate" so "modeRATE CONcern" doesn't mis-file; left off the
  // Cyrillic side where JS \b (ASCII-only) treats every letter as a non-word char.
  { kind: 'ratecon', re: /\brate\s*-?\s*con(f|firmation)?|рейт[\s-]*кон|рейткон/i },
]

export function captionKind(text: string): DocClass | null {
  const t = text.trim()
  if (!t) return null
  return CAPTION_KINDS.find(({ re }) => re.test(t))?.kind ?? null
}
