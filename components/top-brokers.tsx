'use client'

// «Крупнейшие брокеры США» — справочник из старой страницы «Брокеры»: чип на
// компанию, по нажатию — кто они и реквизиты из реестра (MC, DOT, authority, город,
// телефон). Убран при переделке 16.09.2026, возвращён на «Рынок» 19.09.2026.

import { useEffect, useState } from 'react'
import { topBrokerInfo, type TopFacts } from '@/app/actions'
import type { TopBroker } from '@/lib/brokers-top'
import { Info } from '@/components/info'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

export function TopBrokers({ brokers }: { brokers: TopBroker[] }) {
  const locale = useLocale()
  const [history, setHistory] = useState<TopBroker | null>(null)

  // Escape закрывает окно — вместе с ✕ и нажатием мимо.
  useEffect(() => {
    if (!history) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setHistory(null)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [history])

  return (
    <section className="panel h-full p-4">
      <h2 className="mb-3 flex items-center gap-1.5 text-base leading-6 font-semibold text-t1">
        {t(locale, 'brokers.topHeading')}
        <Info text={t(locale, 'brokers.topInfo')} />
      </h2>
      <div className="flex flex-wrap gap-1.5">
        {brokers.map((b) => (
          <button
            key={b.name}
            type="button"
            onClick={() => setHistory(b)}
            className="min-h-8 rounded-full border border-white/8 bg-white/[0.02] px-2.5 text-sm text-t2 transition-colors hover:border-haul-500/50 hover:text-t1 max-md:min-h-10"
          >
            {b.name}
            <span className="ml-1.5 text-t3">{b.hq}</span>
          </button>
        ))}
      </div>

      {history && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setHistory(null)}
          role="dialog"
          aria-modal="true"
          aria-label={history.name}
        >
          <div className="panel relative w-full max-w-sm p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setHistory(null)}
              aria-label={t(locale, 'brokers.close')}
              className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-full text-t3 transition-colors hover:bg-white/10 hover:text-t1"
            >
              ✕
            </button>
            <h3 className="pr-8 text-lg font-semibold text-t1">{history.name}</h3>
            <p className="mt-0.5 text-sm font-medium text-t3">{history.hq}</p>
            {/* Реквизиты выше истории: история — «кто они», а работать надо с номером.
                В списке номера не хранят намеренно — вписанный руками MC устаревает,
                поэтому он тянется из реестра на месте. */}
            <TopBrokerFacts name={history.name} />
            <p className="mt-3 text-base leading-relaxed text-t2">{locale === 'en' ? history.historyEn : history.history}</p>
          </div>
        </div>
      )}
    </section>
  )
}

type Facts = TopFacts | { error: string }

/** Реквизиты компании из реестра: MC, DOT, статус authority, город, телефон. */
function TopBrokerFacts({ name }: { name: string }) {
  const locale = useLocale()
  const [facts, setFacts] = useState<Facts | null>(null)
  // Счётчик попыток — им же и перезапускается загрузка по кнопке «Повторить».
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    setFacts(null)
    topBrokerInfo(name)
      .then((r) => alive && setFacts(r))
      .catch(() => alive && setFacts({ error: t(locale, 'brokers.factsFailed') }))
    return () => {
      alive = false
    }
  }, [name, locale, attempt])

  if (!facts) return <p className="mt-2 text-sm text-t3">{t(locale, 'brokers.factsLoading')}</p>
  if ('error' in facts) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-t3">
        <span>{facts.error === 'no_key' ? t(locale, 'brokers.factsNoKey') : facts.error}</span>
        <button
          type="button"
          onClick={() => setAttempt((n) => n + 1)}
          className="min-h-8 rounded-lg border border-white/12 px-2 font-medium text-t2 transition-colors hover:border-haul-500/50 hover:text-haul-300"
        >
          {t(locale, 'brokers.factsRetry')}
        </button>
      </div>
    )
  }

  const cell = (label: string, value: string | null) =>
    value ? (
      <div className="min-w-0">
        <div className="text-xs font-medium text-t3">{label}</div>
        <div className="nums truncate text-base text-t1">{value}</div>
      </div>
    ) : null

  return (
    <div className="panel-inset mt-3 p-3">
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        {cell('MC', facts.mc)}
        {cell('DOT', facts.dot)}
        {cell(
          t(locale, 'brokers.factsAuthority'),
          facts.authority ? (facts.authority === 'active' ? t(locale, 'brokers.statusActive') : t(locale, 'brokers.statusInactive')) : null,
        )}
        {cell(t(locale, 'brokers.factsCity'), facts.city ? `${facts.city}, ${facts.state ?? ''}` : null)}
      </div>
      {facts.phone && (
        <a href={`tel:${facts.phone.replace(/[^+\d]/g, '')}`} className="nums mt-2 block text-base text-haul-300 hover:underline">
          {facts.phone}
        </a>
      )}
      {/* Юридическое имя отличается от того, под которым брокера знают, и в счёте нужно именно оно. */}
      {facts.legalName && facts.legalName.toLowerCase() !== name.toLowerCase() && (
        <p className="mt-1.5 text-sm text-t3">{facts.legalName}</p>
      )}
    </div>
  )
}
