'use client'

// Справочник платных дорог США: штаты, транспондеры, дорогие места и въезд в
// Манхэттен.
//
// Это то, что диспетчер иначе ищет заново каждый раз, когда груз идёт на восток, —
// и обычно не находит: сведения размазаны по сайтам двух десятков агентств, у
// каждого своя терминология. Здесь они сведены в одну таблицу и отвечают на три
// вопроса, которые задают вслух: чем платить в этом штате, где будет дорого и
// сколько сдерут за въезд в город.

import { useMemo, useState } from 'react'
import { NYC_ZONE, TOLL_HOTSPOTS, TOLL_PROGRAMS, TOLL_STATES, VIOLATION_FEE_CAP, nycZoneCost } from '@/lib/toll-usa'
import { usd } from '@/lib/fmt'
import { Info } from '@/components/info'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

const NET_LABEL: Record<string, string> = {
  ezpass: 'E-ZPass',
  cusiop: 'Central US',
  local: 'local',
}

export function TollGuide() {
  const locale = useLocale()
  const [q, setQ] = useState('')

  const states = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return TOLL_STATES
    return TOLL_STATES.filter(
      (x) =>
        x.code.toLowerCase().includes(s) ||
        x.ru.toLowerCase().includes(s) ||
        x.en.toLowerCase().includes(s) ||
        x.agency.toLowerCase().includes(s) ||
        (x.tag ?? '').toLowerCase().includes(s),
    )
  }, [q])

  return (
    <section className="panel mt-4 p-4">
      <h2 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
        {t(locale, 'tolls.guide.title')}
        <Info text={t(locale, 'tolls.guide.info')} />
      </h2>

      {/* ── Дорогие места ───────────────────────────────────────────────────── */}
      <div className="grid gap-2 sm:grid-cols-2">
        {TOLL_HOTSPOTS.map((h) => (
          <div key={h.name} className="rounded-xl border border-white/8 bg-ink-950/50 p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-[13px] font-semibold text-white/90">{h.name}</span>
              <span className="nums shrink-0 text-[13px] font-bold text-warn-400">{h.amount}</span>
            </div>
            <p className="mt-1 text-[11.5px] leading-relaxed text-white/55">{locale === 'en' ? h.en : h.ru}</p>
          </div>
        ))}
      </div>

      {/* ── Въезд в Манхэттен ───────────────────────────────────────────────── */}
      <NycZone />

      {/* ── Таблица по штатам ───────────────────────────────────────────────── */}
      <details className="mt-3 rounded-xl border border-white/8 bg-ink-950/40 p-3">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[12px] font-medium text-white/70">
          <span className="text-white/35">▸</span>
          {t(locale, 'tolls.guide.states').replace('{n}', String(TOLL_STATES.length))}
        </summary>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t(locale, 'tolls.guide.search')}
          className="mt-2 w-full rounded-lg border border-white/10 bg-ink-950/70 px-2.5 py-1.5 text-[13px] text-white outline-none focus:border-haul-500"
        />

        <ul className="mt-2 flex flex-col gap-1.5">
          {states.map((s) => (
            <li key={s.code} className="rounded-lg border border-white/6 px-2.5 py-2">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="nums rounded bg-white/10 px-1.5 py-0.5 text-[11px] font-bold text-white/75">
                  {s.code}
                </span>
                <span className="text-[13px] font-medium text-white/85">{locale === 'en' ? s.en : s.ru}</span>
                <span className="text-[11.5px] text-white/45">{s.agency}</span>
                {s.tag && (
                  <span className="ml-auto shrink-0 rounded-full bg-haul-500/15 px-2 py-0.5 text-[10.5px] font-medium text-haul-300">
                    {s.tag}
                  </span>
                )}
                {/* Сеть важнее самого тега: с одним E-ZPass закрывается всё
                    восточное побережье, а в Техасе он не работает вовсе. */}
                {s.networks.map((n) => (
                  <span key={n} className="shrink-0 rounded-full bg-white/6 px-1.5 py-0.5 text-[10px] text-white/50">
                    {NET_LABEL[n]}
                  </span>
                ))}
              </div>
              <p className="mt-1 text-[11.5px] leading-relaxed text-white/55">
                {locale === 'en' ? s.noteEn : s.note}
              </p>
            </li>
          ))}
        </ul>
      </details>

      {/* ── Транспондеры и штрафы ───────────────────────────────────────────── */}
      <details className="mt-2 rounded-xl border border-white/8 bg-ink-950/40 p-3">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[12px] font-medium text-white/70">
          <span className="text-white/35">▸</span>
          {t(locale, 'tolls.guide.programs')}
        </summary>
        <ul className="mt-2 flex flex-col gap-2">
          {TOLL_PROGRAMS.map((p) => (
            <li key={p.name} className="rounded-lg border border-white/6 px-2.5 py-2">
              <div className="text-[13px] font-medium text-white/85">{p.name}</div>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-white/55">{locale === 'en' ? p.en : p.ru}</p>
            </li>
          ))}
        </ul>
        <p className="mt-2 rounded-lg bg-bad-500/10 px-2.5 py-2 text-[11.5px] leading-relaxed text-bad-400">
          {t(locale, 'tolls.guide.violation').replace('{cap}', String(VIOLATION_FEE_CAP))}
        </p>
      </details>
    </section>
  )
}

/**
 * Въезд в зону Манхэттена. Считается по въездам, а не по милям, и у грузовиков
 * дневного потолка нет: три подачи за смену — это три полных тарифа, и в ставку
 * их закладывают до того, как груз взят, а не после.
 */
function NycZone() {
  const locale = useLocale()
  const [entries, setEntries] = useState(1)
  const [kind, setKind] = useState<'small' | 'large'>('large')
  const [night, setNight] = useState(false)

  const cost = nycZoneCost(entries, kind, night)
  const box =
    'rounded-lg border border-white/10 bg-ink-950/70 px-2 py-1.5 text-[12.5px] text-white outline-none focus:border-haul-500'

  return (
    <div className="mt-3 rounded-xl border border-white/8 bg-ink-950/50 p-3">
      <div className="flex items-center gap-1.5 text-[12px] font-medium text-white/70">
        {t(locale, 'tolls.nyc.title')}
        <Info text={t(locale, 'tolls.nyc.info')} />
      </div>

      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="mb-0.5 block text-[10.5px] uppercase tracking-wider text-white/45">
            {t(locale, 'tolls.nyc.entries')}
          </span>
          <input
            type="number"
            min={0}
            max={20}
            value={entries}
            onChange={(e) => setEntries(Math.max(0, Math.min(20, Number(e.target.value) || 0)))}
            className={`${box} nums w-20`}
          />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[10.5px] uppercase tracking-wider text-white/45">
            {t(locale, 'tolls.nyc.kind')}
          </span>
          <select value={kind} onChange={(e) => setKind(e.target.value as 'small' | 'large')} className={box}>
            <option value="large">{t(locale, 'tolls.nyc.large')}</option>
            <option value="small">{t(locale, 'tolls.nyc.small')}</option>
          </select>
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 pb-1.5 text-[12px] text-white/70">
          <input type="checkbox" checked={night} onChange={(e) => setNight(e.target.checked)} className="accent-haul-500" />
          {t(locale, 'tolls.nyc.night')
            .replace('{from}', String(NYC_ZONE.nightFrom))
            .replace('{to}', String(NYC_ZONE.nightTo))}
        </label>
        <div className="ml-auto text-right">
          <div className="nums text-[19px] font-bold text-white/90">{usd.format(cost)}</div>
          <div className="text-[10.5px] uppercase tracking-wider text-white/45">{t(locale, 'tolls.nyc.total')}</div>
        </div>
      </div>
    </div>
  )
}
