import Link from 'next/link'
import { notFound } from 'next/navigation'
import { sql } from '@/lib/db'
import { DOC_KINDS, fmtSize, type DocKind } from '@/lib/docs'
import { DocViewer } from '@/components/doc-viewer'

export const dynamic = 'force-dynamic'

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ from?: string }>
}) {
  const { id } = await params
  const back = (await searchParams).from
  const rows = await sql`
    SELECT id, kind, title, mime, size_bytes, load_id, truck_id
    FROM documents WHERE id = ${Number(id)}`
  const doc = rows[0] as
    | {
        id: number
        kind: DocKind
        title: string
        mime: string
        size_bytes: number
        load_id: number | null
        truck_id: number | null
      }
    | undefined
  if (!doc) notFound()

  // Sensible "back": where the document belongs, unless the caller said otherwise.
  const backHref =
    back ?? (doc.load_id ? `/loads/${doc.load_id}` : doc.truck_id ? `/trucks/${doc.truck_id}` : '/docs')

  return (
    // Full width on purpose: a zoomed page needs the whole window, not a narrow
    // reading column — that's what made the document look cut off.
    <main className="px-4 pb-24 pt-6 sm:px-6 sm:pt-8">
      <Link href={backHref} className="text-[13px] text-white/65 transition-colors hover:text-white/90">
        ← Назад
      </Link>

      <div className="mb-4 mt-2 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-[17px] font-semibold">{doc.title}</h1>
          <p className="text-[12px] text-white/55">
            {DOC_KINDS[doc.kind]} · {fmtSize(doc.size_bytes)}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {/* Escape hatch: hand the raw file to the browser's own viewer. Depending on
              the browser's PDF setting this may download instead of open — which is
              exactly why the in-app viewer below is the default. */}
          <a
            href={`/api/docs/${doc.id}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-white/10 px-3 py-2 text-[13px] font-semibold text-white/85 transition-colors hover:bg-white/5"
          >
            Открыть в браузере
          </a>
          <a
            href={`/api/docs/${doc.id}?download=1`}
            download={doc.title}
            className="rounded-xl border border-white/10 px-3 py-2 text-[13px] font-semibold text-white/85 transition-colors hover:bg-white/5"
          >
            Сохранить на компьютер
          </a>
        </div>
      </div>

      <DocViewer id={doc.id} mime={doc.mime} />
    </main>
  )
}
