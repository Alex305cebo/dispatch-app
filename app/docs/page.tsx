import Link from 'next/link'
import { listDocsForLibrary, listTrucks } from '@/lib/loads'
import { DocLibrary, DocUpload } from '@/components/docs'
import { Info } from '@/components/info'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const [rows, trucks] = await Promise.all([listDocsForLibrary(), listTrucks()])
  const groups = trucks.map((t) => ({
    id: t.id,
    label: t.number ?? t.name,
    driver: t.driverName ?? '',
  }))

  return (
    <main className="mx-auto max-w-4xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <header className="mb-5">
        <h1 className="flex items-center gap-2 text-[17px] font-semibold">
          Документы
          <Info side="bottom" text="Единая библиотека всех бумаг: rate con, BOL, POD, страховки, регистрации, инвойсы. Сгруппированы по тракам и водителям, свежие сверху, с фильтром по типу. Rate con можно распознать и сразу создать груз кнопкой сверху. Удаление под именем и PIN, запись остаётся в Журнале." />
        </h1>
        <p className="text-[13px] text-white/65">
          Все бумаги в одном месте — по водителям и датам, как в библиотеке.
        </p>
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
          <span className="block text-[14px] font-semibold text-haul-300">
            Распознать rate con
          </span>
          <span className="block text-[12px] text-white/60">
            Перетащи PDF или фото — ИИ прочитает и сразу создаст груз
          </span>
        </span>
        <span className="ml-auto shrink-0 text-white/45">→</span>
      </Link>

      <div className="panel mb-4 p-4">
        <DocUpload trucks={groups.map((g) => ({ id: g.id, label: g.driver ? `${g.label} · ${g.driver}` : g.label }))} />
      </div>

      <div className="panel p-4">
        <DocLibrary rows={rows} trucks={groups} />
      </div>
    </main>
  )
}
