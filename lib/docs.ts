// Document types + labels. NO db import — the client upload/list component uses
// this file, and lib/db throws outside the server. Queries live in lib/loads.ts.

import { t, type Locale } from './i18n.ts'

// Values are unused for display now (every caller went through docKindLabel()
// below) — this stays around only for its keys (Object.keys(DOC_KINDS) in
// components/docs.tsx enumerates the kind list).
export const DOC_KINDS = {
  ratecon: 'Rate con',
  bol: 'BOL',
  pod: 'POD',
  invoice: 'Инвойс',
  insurance: 'Страховка',
  registration: 'Регистрация',
  repair: 'Чек за ремонт',
  other: 'Другое',
} as const
export type DocKind = keyof typeof DOC_KINDS

export function docKindLabel(kind: DocKind, locale: Locale): string {
  switch (kind) {
    case 'ratecon': return t(locale, 'docs.kind.ratecon')
    case 'bol': return t(locale, 'docs.kind.bol')
    case 'pod': return t(locale, 'docs.kind.pod')
    case 'invoice': return t(locale, 'docs.kind.invoice')
    case 'insurance': return t(locale, 'docs.kind.insurance')
    case 'registration': return t(locale, 'docs.kind.registration')
    case 'repair': return t(locale, 'docs.kind.repair')
    case 'other': return t(locale, 'docs.kind.other')
  }
}

export type DocMeta = {
  id: number
  truckId: number | null
  loadId: number | null
  /** Set when this doc is a repair receipt uploaded from that specific log row. */
  maintenanceId: number | null
  kind: DocKind
  title: string
  mime: string
  sizeBytes: number
  uploadedAt: string
  /** Set once "deleted" — the file stays in the trash until purged for real. */
  deletedAt: string | null
}

/** A document plus the truck/driver it belongs to and its load route — for the
 *  library view that groups by driver and shows откуда→куда. */
export type DocLibRow = DocMeta & {
  groupTruckId: number | null // truck to file it under (doc's truck, else its load's truck)
  truckNumber: string | null
  driverName: string | null
  origin: string | null
  destination: string | null
}

export function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
