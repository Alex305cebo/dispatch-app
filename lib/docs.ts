// Document types + labels. NO db import — the client upload/list component uses
// this file, and lib/db throws outside the server. Queries live in lib/loads.ts.

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
