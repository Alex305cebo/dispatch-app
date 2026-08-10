'use client'

import { DocLink } from '@/components/doc-link'

// A big BOL / POD button next to "Open rate con": opens the document when it exists,
// or uploads one (filed on THIS load with the right kind) when it doesn't. The upload
// state is amber so a missing required doc reads as an action item, matching the glowing
// chip on the status rail.

import { useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { uploadDocument } from '@/app/actions'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

export function DocButton({
  label,
  kind,
  docId,
  loadId,
}: {
  /** Display + toast label, e.g. "BOL". */
  label: string
  /** The doc kind an upload is filed as, e.g. 'bol' | 'pod'. */
  kind: string
  docId: number | null
  loadId: number
}) {
  const locale = useLocale()
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [pending, start] = useTransition()

  if (docId)
    return (
      <DocLink
        docId={docId}
        className="inline-flex items-center gap-2 rounded-xl border border-good-400/30 px-3 py-2 text-[13px] font-semibold text-good-400 transition-colors hover:border-good-400/60 hover:bg-good-400/10"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-4"
          aria-hidden
        >
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5" />
        </svg>
        {t(locale, 'loadDetail.openDoc').replace('{label}', label)}
      </DocLink>
    )

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // let the same file be re-picked after an error
    if (!file) return
    start(async () => {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('kind', kind)
      fd.append('loadId', String(loadId))
      const res = await uploadDocument(fd)
      if (res && 'error' in res) notify('error', res.error)
      else {
        notify('ok', t(locale, 'loadDetail.docUploaded').replace('{label}', label))
        router.refresh()
      }
    })
  }

  return (
    <>
      <input ref={inputRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={onFile} />
      <button
        type="button"
        disabled={pending}
        onClick={() => inputRef.current?.click()}
        aria-busy={pending || undefined}
        /* w-full so the pair fills its 2-up grid on a phone and the two read as equals,
           back to auto width once they sit inline. Press and focus ring mirror
           components/button.tsx: this control had neither, so a tap gave no answer and
           a keyboard user got no ring at all. */
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-warn-400/50 px-3 py-2 text-[13px] font-semibold text-warn-400 outline-none transition-[transform,background-color,border-color] duration-[120ms] ease-out hover:border-warn-400 hover:bg-warn-400/10 focus-visible:ring-2 focus-visible:ring-warn-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950 active:translate-y-px active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60 sm:w-auto"
      >
        {/* A spinner, not "…": the ellipsis was indistinguishable from a truncated
            label, which is the one thing a busy state must not look like. */}
        {pending ? (
          <span
            aria-hidden
            className="size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent opacity-80"
          />
        ) : (
          <Plus size={16} strokeWidth={2.5} />
        )}
        {t(locale, 'loadDetail.uploadDoc').replace('{label}', label)}
      </button>
    </>
  )
}
