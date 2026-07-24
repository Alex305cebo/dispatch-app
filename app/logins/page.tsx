import { sql } from '@/lib/db'
import { docKindLabel, type DocKind } from '@/lib/docs'
import { getGeminiUsage } from '@/lib/gemini-usage'
import { Info } from '@/components/info'
import { Name } from '@/components/name'
import { getLocale } from '@/lib/i18n-server'
import { t, type Locale } from '@/lib/i18n'

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
  who: string | null // raw name; null → the "no name" placeholder (rendered, never abbreviated)
  what: string // main action
  detail: string // muted second line: device (login) or load route (delete)
  where: string // actor city/country from the IP
  tone: 'login' | 'delete'
}

// ponytail: naive UA sniff — enough to say "iPhone · Safari" in an audit list.
function device(ua: string | null, locale: Locale): string {
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
            : t(locale, 'admin.logins.pc')
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

function when(at: string, locale: Locale): string {
  return new Date(at).toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-US', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function Page() {
  const locale = await getLocale()
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
        who: r.who,
        what: t(locale, 'admin.logins.loggedIn'),
        detail: device(r.user_agent, locale),
        where: r.city ?? t(locale, 'admin.logins.local'),
        tone: 'login',
      }),
    ),
    ...audits.map((r): Event => {
      const route = [r.from_loc, r.to_loc].filter(Boolean).join(' → ')
      const docLabel = r.doc_kind ? docKindLabel(r.doc_kind as DocKind, locale) : t(locale, 'admin.logins.docFallback')
      const target = r.target ?? '—'
      const what =
        r.action === 'delete_load'
          ? t(locale, 'admin.logins.deletedLoad').replace('{target}', r.target ?? route ?? '—')
          : r.action === 'purge_document'
            ? t(locale, 'admin.logins.purgedDoc').replace('{doc}', docLabel).replace('{target}', target)
            : r.action === 'delete_todo'
              ? t(locale, 'admin.logins.deletedTodo').replace('{target}', target)
              : r.action === 'delete_maintenance'
                ? t(locale, 'admin.logins.deletedMaintenance').replace('{target}', target)
                : t(locale, 'admin.logins.trashedDoc').replace('{doc}', docLabel).replace('{target}', target)
      // For a load the route is already in the title; for a doc show it as detail.
      const detail = r.action === 'delete_load' || r.action === 'delete_todo' || r.action === 'delete_maintenance' ? '' : route
      return {
        at: r.at,
        who: r.who,
        what,
        detail,
        where: r.city ?? t(locale, 'admin.logins.local'),
        tone: 'delete',
      }
    }),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

  const numLocale = locale === 'ru' ? 'ru-RU' : 'en-US'

  return (
    <main className="mx-auto max-w-4xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <div className="mb-4">
        <h1 className="text-xl font-bold tracking-tight">{t(locale, 'admin.logins.title')}</h1>
        <p className="text-[13px] text-white/65">
          {t(locale, 'admin.logins.subtitle').replace('{n}', String(events.length))}
        </p>
      </div>

      {/* Gemini token spend — our running counter (Google AI Studio has the full total). */}
      <div className="panel mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 p-4">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/55">
          {t(locale, 'admin.logins.geminiSpend')}
          <Info text={t(locale, 'admin.logins.geminiInfo')} />
        </div>
        <div>
          <span className="nums text-[18px] font-bold">{gemini.tokens.toLocaleString(numLocale)}</span>
          <span className="ml-1 text-[12px] text-white/55">{t(locale, 'admin.logins.tokens')}</span>
        </div>
        <div>
          <span className="nums text-[18px] font-bold">{gemini.calls.toLocaleString(numLocale)}</span>
          <span className="ml-1 text-[12px] text-white/55">{t(locale, 'admin.logins.calls')}</span>
        </div>
        {gemini.since && (
          <div className="text-[11px] text-white/45">
            {t(locale, 'admin.logins.since')}
            {gemini.since.slice(0, 10)}
          </div>
        )}
      </div>

      {events.length === 0 ? (
        <div className="panel p-8 text-center">
          <p className="text-[15px] font-medium">{t(locale, 'admin.logins.emptyTitle')}</p>
          <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-white/70">
            {t(locale, 'admin.logins.emptyBody')}
          </p>
        </div>
      ) : (
        <ul className="panel divide-y divide-white/5 p-0">
          {events.map((e, i) => (
            <li key={i} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-3 text-[13px]">
              <div className="flex min-w-0 flex-1 basis-[220px] flex-col gap-0.5">
                <span className="flex items-center gap-2">
                  <span
                    className={`size-1.5 shrink-0 rounded-full ${e.tone === 'delete' ? 'bg-bad-400' : 'bg-good-500'}`}
                  />
                  <span className="font-medium text-white/90">
                    {e.who ? <Name full={e.who} /> : t(locale, 'admin.logins.noName')}
                  </span>
                </span>
                <span className="pl-3.5 text-white/80">{e.what}</span>
                {e.detail && <span className="pl-3.5 text-[11px] text-white/45">{e.detail}</span>}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
                <span className="nums text-[12px] text-white/55">{when(e.at, locale)}</span>
                <span className="text-[11px] text-white/45">{e.where}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
