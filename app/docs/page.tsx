import Link from 'next/link'
import { listDocsForLibrary, listTrashedDocs, listTrucks } from '@/lib/loads'
import { DocUpload } from '@/components/docs'
import { DocsTabs } from './docs-tabs'
import { Info } from '@/components/info'
import { companyScope } from '@/lib/session'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'

export const dynamic = 'force-dynamic'

export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const tab = (await searchParams).tab === 'trash' ? 'trash' : 'library'
  const companyId = await companyScope()
  const locale = await getLocale()
  const [rows, trash, trucks] = await Promise.all([
    listDocsForLibrary(companyId),
    listTrashedDocs(companyId),
    listTrucks(companyId),
  ])
  const groups = trucks.map((tr) => ({
    id: tr.id,
    label: tr.number ?? tr.name,
    driver: tr.driverName ?? '',
  }))

  return (
    <main className="mx-auto max-w-4xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <header className="mb-5">
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
          {t(locale, 'docs.title')}
          <Info side="bottom" text={t(locale, 'docs.info')} />
        </h1>
        <p className="text-[13px] text-white/65">{t(locale, 'docs.subtitle')}</p>
      </header>

      {/* Rate con recognizer — the fast path, folded into the library. */}
      <Link
        href="/import"
        className="mb-3 flex items-center gap-3 rounded-2xl border border-haul-500/30 bg-haul-500/10 px-4 py-3 transition-colors hover:bg-haul-500/15"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-haul-500/20 text-[18px]">
          ⚡
        </span>
        <span className="min-w-0">
          <span className="block text-[14px] font-semibold text-haul-300">{t(locale, 'docs.recognize.title')}</span>
          <span className="block text-[12px] text-white/60">{t(locale, 'docs.recognize.sub')}</span>
        </span>
        <span className="ml-auto shrink-0 text-white/45">→</span>
      </Link>

      <div className="panel mb-4 p-4">
        <DocUpload trucks={groups.map((g) => ({ id: g.id, label: g.driver ? `${g.label} · ${g.driver}` : g.label }))} />
      </div>

      {/* Вкладки — состояние, а не переход: обе выборки уже загружены выше. */}
      <DocsTabs initialTab={tab} rows={rows} trash={trash} trucks={groups} />

    </main>
  )
}
