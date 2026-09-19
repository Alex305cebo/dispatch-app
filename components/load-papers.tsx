'use client'

// Полоса бумаг груза: Rate Con, BOL, POD, инвойс — одной строкой прямо в строке груза.
//
// Смысл полосы в том, что бумага и деньги за один и тот же груз лежат рядом: раньше
// «чего не хватает» было написано словами на странице оплат, а искать и грузить файл
// надо было в другом разделе. Здесь плитка бумаги — это и есть кнопка: есть файл —
// открывается окном поверх страницы, нет — та же плитка берёт файл и грузит его с
// уже проставленным типом и грузом.
//
// Лишние бумаги того же груза (пломба, фото, Driver Info) показаны следом, а хвост
// прячется за «+N» со ссылкой на сам груз — иначе серия фото растянет строку на
// экран.

import { useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { DocLink } from '@/components/doc-link'
import { uploadDocument } from '@/app/actions'
import { safeUploadFile } from '@/lib/upload-name'
import { docKindLabel, type DocKind } from '@/lib/docs'
import { notify } from '@/lib/notify'
import { staleBuildMessage } from '@/components/build-watch'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

/** Бумага груза как её отдаёт сервер: тип + id файла, если он загружен. */
export type LoadPaper = { id: number; kind: DocKind }

/** Четыре бумаги груза — всегда на виду, даже когда их нет: пустая плитка и есть
 * напоминание. */
const REQUIRED: DocKind[] = ['ratecon', 'bol', 'pod', 'invoice']

/** Из них человек приносит только три. Инвойс собирает кнопка «Собрать пакет», и
 * держать его в списке «не хватает» значит звать грузить чужую бумагу руками. */
const NEEDED: DocKind[] = ['ratecon', 'bol', 'pod']

const EXTRA_SHOWN = 2

const chip =
  'inline-flex min-h-7 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold transition-colors max-md:min-h-9'

export function LoadPapers({
  loadId,
  papers,
  urgent = false,
}: {
  loadId: number
  papers: LoadPaper[]
  /** Груз уже сдан — недостающая бумага держит деньги, поэтому красным. Пока груз в
   * пути её и не должно быть, и красить нечего. */
  urgent?: boolean
}) {
  const locale = useLocale()
  const router = useRouter()
  const [pending, start] = useTransition()
  const inputs = useRef<Record<string, HTMLInputElement | null>>({})

  const firstOf = (kind: DocKind) => papers.find((p) => p.kind === kind) ?? null
  const extra = papers.filter((p) => !REQUIRED.includes(p.kind))

  function send(kind: DocKind, list: FileList | null) {
    const files = Array.from(list ?? [])
    if (files.length === 0) return
    start(async () => {
      let saved = 0
      for (const file of files) {
        const fd = new FormData()
        fd.append('file', safeUploadFile(file))
        fd.append('kind', kind)
        fd.append('loadId', String(loadId))
        try {
          const res = await uploadDocument(fd)
          if ('error' in res) notify('error', `${file.name}: ${res.error}`)
          else saved++
        } catch (e) {
          notify('error', staleBuildMessage(e instanceof Error ? e.message : String(e), locale))
          break
        }
      }
      const el = inputs.current[kind]
      if (el) el.value = ''
      if (saved > 0) {
        notify('ok', t(locale, 'docs.upload.saved'), docKindLabel(kind, locale))
        router.refresh()
      }
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {REQUIRED.map((kind) => {
        const doc = firstOf(kind)
        const label = docKindLabel(kind, locale)
        if (doc) {
          return (
            <DocLink
              key={kind}
              docId={doc.id}
              title={t(locale, 'papers.open').replace('{doc}', label)}
              className={`${chip} bg-good-500/15 text-good-400 hover:bg-good-500/25`}
            >
              {label}
            </DocLink>
          )
        }
        return (
          <label
            key={kind}
            title={t(locale, 'papers.add').replace('{doc}', label)}
            className={`${chip} cursor-pointer border border-dashed ${
              urgent && NEEDED.includes(kind)
                ? 'border-bad-400/45 text-bad-400 hover:bg-bad-400/10'
                : 'border-white/15 text-t3 hover:border-white/30 hover:text-t2'
            } ${pending ? 'opacity-50' : ''}`}
          >
            + {label}
            <input
              ref={(el) => {
                inputs.current[kind] = el
              }}
              type="file"
              accept="application/pdf,image/*"
              multiple
              className="hidden"
              disabled={pending}
              onChange={(e) => send(kind, e.target.files)}
            />
          </label>
        )
      })}

      {extra.slice(0, EXTRA_SHOWN).map((doc) => (
        <DocLink
          key={doc.id}
          docId={doc.id}
          title={t(locale, 'papers.open').replace('{doc}', docKindLabel(doc.kind, locale))}
          className={`${chip} bg-white/8 text-t2 hover:bg-white/14 hover:text-t1`}
        >
          {docKindLabel(doc.kind, locale)}
        </DocLink>
      ))}
      {extra.length > EXTRA_SHOWN && (
        <span className={`${chip} bg-white/6 text-t3`}>+{extra.length - EXTRA_SHOWN}</span>
      )}
    </div>
  )
}

/** Чего не хватает, чтобы груз можно было сдать в оплату. */
export function missingPapers(papers: LoadPaper[]): DocKind[] {
  return NEEDED.filter((k) => !papers.some((p) => p.kind === k))
}

/** Груз собран: rate con, BOL и POD на месте. */
export function papersComplete(papers: LoadPaper[]): boolean {
  return missingPapers(papers).length === 0
}
