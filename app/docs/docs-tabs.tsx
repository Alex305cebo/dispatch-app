'use client'

// Библиотека / Корзина on /docs.
//
// These were two <Link>s carrying ?tab=trash, i.e. a full route navigation — and since
// app/loading.tsx added a route-level Suspense boundary, every switch also flashed a
// whole-page skeleton. It bought nothing: the page already fetches BOTH lists on every
// render (listDocsForLibrary and listTrashedDocs), so the click re-queried data that
// was in the payload it was standing on. Now it is a state toggle.
//
// ?tab=trash still sets the initial tab, so old links and bookmarks keep working.

import { useState } from 'react'
import { DocLibrary, DocTrash } from '@/components/docs'
import type { DocLibRow } from '@/lib/docs'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

export function DocsTabs({
  initialTab,
  rows,
  trash,
  trucks,
}: {
  initialTab: 'library' | 'trash'
  rows: DocLibRow[]
  trash: DocLibRow[]
  trucks: { id: number; label: string; driver: string }[]
}) {
  const locale = useLocale()
  const [tab, setTab] = useState(initialTab)

  const tabClass = (active: boolean) =>
    `-mb-px border-b-2 px-3 py-2 text-[13px] font-medium transition-colors ${
      active ? 'border-haul-500 text-white' : 'border-transparent text-white/55 hover:text-white/85'
    }`

  return (
    <>
      <div className="mb-4 flex gap-1.5 border-b border-white/8">
        <button type="button" onClick={() => setTab('library')} className={tabClass(tab === 'library')}>
          {t(locale, 'docs.tab.library')}
        </button>
        <button type="button" onClick={() => setTab('trash')} className={tabClass(tab === 'trash')}>
          {t(locale, 'docs.tab.trash')}
          {trash.length > 0 ? ` · ${trash.length}` : ''}
        </button>
      </div>

      <div className="panel p-4">
        {tab === 'library' ? <DocLibrary rows={rows} trucks={trucks} /> : <DocTrash rows={trash} />}
      </div>
    </>
  )
}
