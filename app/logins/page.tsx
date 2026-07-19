import { sql } from '@/lib/db'
import { DOC_KINDS, type DocKind } from '@/lib/docs'
import { getGeminiUsage } from '@/lib/gemini-usage'
import { Info } from '@/components/info'

export const dynamic = 'force-dynamic'

type LoginRow = {
  who: string | null
  ip: string | null
  user_agent: string | null
  city: string | null
  at: string
}
type AuditRow = {
  who: string | null
  action: string
  target: string | null
  doc_kind: string | null
  from_loc: string | null
  to_loc: string | null
  city: string | null
  at: string
}

type Event = {
  at: string
  who: string
  what: string // main action
  detail: string // muted second line: device (login) or load route (delete)
  where: string // actor city/country from the IP
  tone: 'login' | 'delete'
}

// ponytail: naive UA sniff — enough to say "iPhone · Safari" in an audit list.
function device(ua: string | null): string {
  if (!ua) return '—'
  const os = /iPhone|iPad/.test(ua)
    ? 'iPhone'
    : /Android/.test(ua)
      ? 'Android'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X/.test(ua)
          ? 'Mac'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'ПК'
  const br = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Safari\//.test(ua)
            ? 'Safari'
            : '—'
  return `${os} · ${br}`
}

function when(at: string): string {
  return new Date(at).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function Page() {
  const [loginsRaw, auditsRaw, gemini] = await Promise.all([
    sql`SELECT who, ip, user_agent, city, at FROM logins ORDER BY at DESC LIMIT 200`,
    sql`SELECT who, action, target, doc_kind, from_loc, to_loc, city, at
        FROM audit_log ORDER BY at DESC LIMIT 200`,
    getGeminiUsage(),
  ])
  const logins = loginsRaw as LoginRow[]
  const audits = auditsRaw as AuditRow[]

  const events: Event[] = [
    ...logins.map(
      (r): Event => ({
        at: r.at,
        who: r.who ?? 'Без имени',
        what: 'Вход',
        detail: device(r.user_agent),
        where: r.city ?? 'локально',
        tone: 'login',
      }),
    ),
    ...audits.map((r): Event => {
      const route = [r.from_loc, r.to_loc].filter(Boolean).join(' → ')
      const isLoad = r.action === 'delete_load'
      const what = isLoad
        ? `Удалил груз «${r.target ?? route ?? '—'}»`
        : `Удалил ${DOC_KINDS[r.doc_kind as DocKind] ?? 'документ'} «${r.target ?? '—'}»`
      return {
        at: r.at,
        who: r.who ?? 'Без имени',
        what,
        // For a load the route is already in the title; for a doc show it as detail.
        detail: isLoad ? '' : route,
        where: r.city ?? 'локально',
        tone: 'delete',
      }
    }),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

  return (
    <main className="mx-auto max-w-4xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <div className="mb-4">
        <h1 className="text-[17px] font-semibold">Журнал</h1>
        <p className="text-[13px] text-white/65">
          Кто, что и откуда: входы и действия с документами · последние {events.length}
        </p>
      </div>

      {/* Gemini token spend — our running counter (Google AI Studio has the full total). */}
      <div className="panel mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 p-4">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/55">
          Расход ИИ · Gemini
          <Info text="Сколько токенов приложение потратило на распознавание rate con через Google Gemini. Это наш счётчик — считает с момента добавления. Полный и точный расход (и лимиты) — в Google AI Studio (aistudio.google.com) по твоему API-ключу." />
        </div>
        <div>
          <span className="nums text-[18px] font-bold">{gemini.tokens.toLocaleString('ru-RU')}</span>
          <span className="ml-1 text-[12px] text-white/55">токенов</span>
        </div>
        <div>
          <span className="nums text-[18px] font-bold">{gemini.calls.toLocaleString('ru-RU')}</span>
          <span className="ml-1 text-[12px] text-white/55">запросов</span>
        </div>
        {gemini.since && (
          <div className="text-[11px] text-white/45">с {gemini.since.slice(0, 10)}</div>
        )}
      </div>

      {events.length === 0 ? (
        <div className="panel p-8 text-center">
          <p className="text-[15px] font-medium">Пока пусто</p>
          <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-white/70">
            Здесь появятся входы и действия: кто, что, откуда (город по IP) и когда.
          </p>
        </div>
      ) : (
        <div className="panel overflow-x-auto p-0">
          <table className="w-full min-w-[640px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-white/8 text-left text-[10px] uppercase tracking-wider text-white/45">
                <th className="px-4 py-2.5 font-medium">Кто</th>
                <th className="px-4 py-2.5 font-medium">Что</th>
                <th className="px-4 py-2.5 font-medium">Откуда</th>
                <th className="px-4 py-2.5 font-medium">Когда</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e, i) => (
                <tr key={i} className="border-b border-white/5 last:border-0 align-top">
                  <td className="px-4 py-2.5 font-medium text-white/90">{e.who}</td>
                  <td className="px-4 py-2.5 text-white/80">
                    <span className="flex items-center gap-2">
                      <span
                        className={`size-1.5 shrink-0 rounded-full ${
                          e.tone === 'delete' ? 'bg-bad-400' : 'bg-good-500'
                        }`}
                      />
                      {e.what}
                    </span>
                    {e.detail && <span className="mt-0.5 block pl-3.5 text-[11px] text-white/45">{e.detail}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-white/60">{e.where}</td>
                  <td className="nums px-4 py-2.5 text-white/55">{when(e.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
