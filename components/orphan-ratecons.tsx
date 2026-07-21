'use client'

// Rate cons uploaded to this truck that never became a load — usually because the
// AI read (60-90s on a scan) was interrupted by a page reload. One button turns
// each into a load server-side, so no re-uploading and nothing left stranded.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createLoadFromExistingRc, deleteDocument } from '@/app/actions'
import { DeleteButton } from '@/components/delete-button'
import { notify } from '@/lib/notify'

export type OrphanRc = { id: number; title: string; uploadedAt: string }

export function OrphanRateCons({ truckId, docs }: { truckId: number; docs: OrphanRc[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [working, setWorking] = useState<number | null>(null)

  if (docs.length === 0) return null

  function make(docId: number) {
    setWorking(docId)
    start(async () => {
      const res = await createLoadFromExistingRc(docId, truckId)
      setWorking(null)
      if ('error' in res) notify('error', res.error)
      else {
        notify('ok', 'Груз создан из рейткона')
        router.refresh()
      }
    })
  }

  return (
    <div className="mt-3 rounded-xl border border-warn-400/25 bg-warn-400/[0.06] p-3">
      <p className="text-[12px] font-semibold text-warn-300">
        Рейткон загружен, но груз из него не создан
      </p>
      <p className="mt-0.5 text-[11.5px] leading-relaxed text-white/60">
        Разбор идёт на сервере (скан — до полутора минут). Страницу можно не держать
        открытой.
      </p>
      <ul className="mt-2.5 flex flex-col gap-1.5">
        {docs.map((d) => (
          <li
            key={d.id}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-white/8 bg-ink-900/50 px-2.5 py-2"
          >
            <Link
              href={`/view/${d.id}`}
              className="min-w-0 flex-1 truncate text-[12.5px] text-white/80 hover:text-haul-400 hover:underline"
            >
              {d.title}
            </Link>
            <span className="nums shrink-0 text-[11px] text-white/40">
              {d.uploadedAt.slice(0, 10)}
            </span>
            <button
              disabled={pending}
              onClick={() => make(d.id)}
              className="shrink-0 rounded-lg bg-haul-500 px-3 py-1 text-[12px] font-semibold transition-colors hover:bg-haul-400 disabled:opacity-40"
            >
              {working === d.id ? 'Читаю ИИ…' : 'Создать груз'}
            </button>
            <DeleteButton
              action={deleteDocument}
              id={d.id}
              title={d.title}
              note="лишний рейткон — переместится в корзину, груз из него уже не создать."
            />
          </li>
        ))}
      </ul>
    </div>
  )
}
