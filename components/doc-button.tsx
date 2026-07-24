'use client'

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
      <a
        href={`/view/${docId}`}
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
      </a>
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
        className="inline-flex items-center gap-2 rounded-xl border border-dashed border-warn-400/50 px-3 py-2 text-[13px] font-semibold text-warn-400 transition-colors hover:border-warn-400 hover:bg-warn-400/10 disabled:opacity-60"
      >
        <Plus size={16} strokeWidth={2.5} />
        {pending ? '…' : t(locale, 'loadDetail.uploadDoc').replace('{label}', label)}
      </button>
    </>
  )
}
