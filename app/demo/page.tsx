import Link from 'next/link'

// Public, no login required (excluded in middleware's matcher) — a self-contained
// preview with entirely made-up numbers. Nothing here touches the database, so
// there is zero risk of a visitor ever seeing a real driver's phone number, a real
// rate, or a real broker contact. Not wired to the rest of the app: no truck/load
// detail pages exist for these fake ids, on purpose — this is a taste, not a sandbox.

const FLEET = [
  { id: 1, number: '312', driver: 'Alex Morgan', city: 'Dallas, TX', status: 'едет', week: 4200, tone: 'good' },
  { id: 2, number: '447', driver: 'Sam Rivera', city: 'Denver, CO', status: 'on duty', week: 3100, tone: 'on' },
  { id: 3, number: '198', driver: 'Jordan Lee', city: 'Atlanta, GA', status: 'стоит', week: 0, tone: 'rest' },
  { id: 4, number: '265', driver: 'Casey Brooks', city: 'Phoenix, AZ', status: 'едет', week: 5400, tone: 'good' },
] as const

const LOADS = [
  { route: 'Dallas, TX → Denver, CO', status: 'В пути', truck: '312 · Alex Morgan', net: 1240, rate: 2600 },
  { route: 'Atlanta, GA → Phoenix, AZ', status: 'Взят', truck: '265 · Casey Brooks', net: 980, rate: 2150 },
  { route: 'Chicago, IL → Dallas, TX', status: 'Доставлен', truck: '447 · Sam Rivera', net: 1510, rate: 3050 },
] as const

const TONE_DOT = { good: 'bg-good-500', on: 'bg-haul-500', rest: 'bg-white/30' } as const
const STATUS_TONE = { 'В пути': 'text-haul-300', Взят: 'text-good-400', Доставлен: 'text-white/60' } as const

export default function DemoPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-haul-500/25 bg-haul-500/[0.07] px-4 py-3">
        <p className="text-[13px] leading-relaxed text-haul-300">
          Это демо с выдуманными данными — трак, водители, ставки ниже ненастоящие. Реальный парк виден
          после входа.
        </p>
        <Link
          href="/login"
          className="shrink-0 rounded-lg bg-haul-500 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-haul-400"
        >
          Войти →
        </Link>
      </div>

      <h1 className="text-[17px] font-semibold">Обзор</h1>
      <p className="mb-6 text-[13px] text-white/65">4 трак(ов) — что парк заработал и что везёт сейчас.</p>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Рейт всего', value: '$12,700', sub: 'чистыми $5,180' },
          { label: 'RPM · доход на милю', value: '$2.85/mi' },
          { label: 'В работе', value: '3' },
          { label: 'Всего миль', value: '4,460' },
        ].map((s) => (
          <div key={s.label} className="panel p-3.5 text-center">
            <div className="nums text-[16px] font-bold">{s.value}</div>
            {s.sub && <div className="nums mt-0.5 text-[11px] text-good-400/90">{s.sub}</div>}
            <div className="mt-1 text-[10px] uppercase tracking-wider text-white/55">{s.label}</div>
          </div>
        ))}
      </div>

      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/62">Парк</h2>
      <div className="mb-6 grid gap-2 sm:grid-cols-2">
        {FLEET.map((t) => (
          <div key={t.id} className="panel flex items-center gap-3 p-3.5">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/8 text-[13px] font-semibold text-white/70">
              {t.driver
                .split(' ')
                .map((w) => w[0])
                .join('')}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[14px] font-medium">
                <span className={`size-2 shrink-0 rounded-full ${TONE_DOT[t.tone]}`} />
                {t.number} · {t.driver}
              </div>
              <div className="truncate text-[12px] text-white/60">{t.city}</div>
            </div>
            <div className="shrink-0 text-right">
              <div className="nums text-[13px] font-bold text-good-400">${t.week.toLocaleString('en-US')}</div>
              <div className="text-[9px] uppercase tracking-wider text-white/40">за неделю</div>
            </div>
          </div>
        ))}
      </div>

      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/62">Последние грузы</h2>
      <div className="flex flex-col gap-2">
        {LOADS.map((l, i) => (
          <div key={i} className="panel flex items-center gap-3 p-3.5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-[14px] font-medium">{l.route}</span>
                <span className={`text-[11px] font-semibold ${STATUS_TONE[l.status]}`}>{l.status}</span>
              </div>
              <div className="nums mt-0.5 text-[12px] text-white/60">
                {l.truck} · чистыми <span className="text-good-400/90">${l.net.toLocaleString('en-US')}</span>
              </div>
            </div>
            <div className="nums shrink-0 text-[15px] font-bold">${l.rate.toLocaleString('en-US')}</div>
          </div>
        ))}
      </div>
    </main>
  )
}
