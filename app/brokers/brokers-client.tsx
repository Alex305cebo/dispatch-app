'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { fillBrokerMc, markPaid, runBrokerCheck, topBrokerInfo, updateBrokerInfo } from '@/app/actions'
import { useRouter } from 'next/navigation'
import { notify } from '@/lib/notify'
import type { BrokerCheck } from '@/lib/fmcsa'
import type { OurBroker } from '@/lib/brokers'
import type { TopBroker } from '@/lib/brokers-top'
import { BrokerChecklist } from '@/components/broker-checklist'
import { Info } from '@/components/info'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'
import { usd, usd2 } from '@/lib/fmt'
import Link from 'next/link'

const input =
  'w-full rounded-xl border border-white/10 bg-ink-950/70 px-3 py-2 text-[14px] text-white outline-none focus:border-haul-500'

export function BrokersClient({ ourBrokers, topBrokers }: { ourBrokers: OurBroker[]; topBrokers: TopBroker[] }) {
  const locale = useLocale()
  const [by, setBy] = useState<'mc' | 'dot'>('mc')
  const [value, setValue] = useState('')
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'nokey' | 'error'>('idle')
  const [data, setData] = useState<BrokerCheck | null>(null)
  const [err, setErr] = useState('')
  const [, start] = useTransition()

  // Сумма долга по всем брокерам сразу: по строкам её пришлось бы складывать глазами.
  const owedTotal = useMemo(() => ourBrokers.reduce((n, b) => n + b.owed, 0), [ourBrokers])

  const [query, setQuery] = useState('')
  const [history, setHistory] = useState<TopBroker | null>(null)

  const router = useRouter()

  // MC подбирается САМ: раздел открыт — приложение молча дозаполняет тех, у кого его
  // нет, партиями по несколько штук и зовёт себя снова, пока есть кого дозаполнять.
  // Кнопки на это нет намеренно: номер компании — не работа диспетчера, он либо есть
  // в документе, либо берётся из реестра, и оба пути к человеку отношения не имеют.
  // Что сейчас с подбором. Молчаливая фоновая работа — худший вариант из возможных:
  // когда номера не появляются, с той стороны экрана не отличить «ищу» от «не могу
  // искать вообще, потому что нет ключа». Поэтому состояние видно строкой в шапке.
  const [mcState, setMcState] = useState<'idle' | 'working' | 'no_key' | 'done'>('idle')

  useEffect(() => {
    let alive = true
    ;(async () => {
      for (let round = 0; round < 8 && alive; round++) {
        setMcState('working')
        const res = await fillBrokerMc().catch(() => null)
        if (!alive) return
        if (!res) {
          setMcState('done')
          return
        }
        if (res.reason === 'no_key') {
          setMcState('no_key')
          return
        }
        if (res.filled > 0) router.refresh()
        if (res.left === 0) {
          setMcState('done')
          return
        }
      }
      if (alive) setMcState('done')
    })()
    return () => {
      alive = false
    }
  }, [router])

  // Раскрытый список неоплаченных рейсов брокера и раскрытая форма правки — по
  // одному за раз: две открытые карточки в узком списке читаются как одна.
  const [owedFor, setOwedFor] = useState<string | null>(null)
  const [editFor, setEditFor] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function pay(loadId: number) {
    setBusy(true)
    start(async () => {
      const res = await markPaid(loadId, true)
      setBusy(false)
      if (res?.error) {
        notify('error', res.error)
        return
      }
      notify('ok', t(locale, 'brokers.paidDone'))
      router.refresh()
    })
  }

  // Escape closes the history bubble (plus the always-visible ✕ and click-outside).
  useEffect(() => {
    if (!history) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setHistory(null)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [history])

  function check(kind: 'mc' | 'dot', v: string) {
    const val = v.trim()
    if (!val) return
    setBy(kind)
    setValue(val)
    setState('loading')
    setData(null)
    setErr('')
    start(async () => {
      const res = await runBrokerCheck(kind, val)
      if ('error' in res) {
        if (res.error === 'no_key') setState('nokey')
        else {
          setErr(res.error)
          setState('error')
        }
      } else {
        setData(res)
        setState('done')
      }
    })
  }

  const filtered = useMemo(() => {
    const q = query.toLowerCase().replace(/\s+/g, ' ').trim()
    if (!q) return ourBrokers
    const qDigits = q.replace(/\D/g, '')
    return ourBrokers.filter(
      (b) =>
        (b.name ?? '').toLowerCase().includes(q) ||
        (!!qDigits && (b.mc ?? '').includes(qDigits)) ||
        (!!qDigits && (b.phone ?? '').replace(/\D/g, '').includes(qDigits)),
    )
  }, [ourBrokers, query])

  return (
    <>
      {/* Порядок — по частоте: свой список с поиском и долгами открывают каждый день,
          проверку по FMCSA — при новом брокере, справочник — изредка. */}
      {/* ── Our brokers ────────────────────────────────────── */}
      <section className="panel p-5">
        <h2 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
          {t(locale, 'brokers.dbHeading')}
          <Info text={t(locale, 'brokers.dbInfo')} />
          <Info text={t(locale, 'brokers.moneyInfo')} />
          {/* Подбор MC идёт сам — но сказать об этом надо, иначе «ничего не меняется»
              и «идёт работа» выглядят одинаково. */}
          {mcState === 'working' && (
            <span className="normal-case text-white/35">{t(locale, 'brokers.mcWorking')}</span>
          )}
          {mcState === 'no_key' && (
            <span className="normal-case text-warn-400">{t(locale, 'brokers.mcNoKey')}</span>
          )}
          {/* Сколько нам должны все брокеры вместе — первое, что спрашивают в пятницу. */}
          {owedTotal > 0 && (
            <span className="nums ml-auto rounded-full bg-warn-500/15 px-2 py-0.5 text-[11px] font-medium normal-case text-warn-400">
              {t(locale, 'brokers.owes').replace('{sum}', usd.format(owedTotal))}
            </span>
          )}
          <span className={`nums rounded-full bg-white/8 px-2 py-0.5 text-[11px] normal-case text-white/60${owedTotal > 0 ? '' : ' ml-auto'}`}>
            {ourBrokers.length}
          </span>
        </h2>

        {ourBrokers.length === 0 ? (
          <p className="text-[13px] text-white/50">{t(locale, 'brokers.empty')}</p>
        ) : (
          <>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t(locale, 'brokers.searchPlaceholder')}
              className={`${input} mb-3`}
            />
            {filtered.length === 0 ? (
              <p className="text-[13px] text-white/45">{t(locale, 'brokers.noMatch')}</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {filtered.map((b) => {
                  // Один ключ на строку: по нему раскрывается и долг, и форма правки.
                  const rowKey = (b.mc ?? b.name ?? '') + b.loadCount
                  return (
                  <li
                    key={rowKey}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-white/6 px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Карточку подписывает КОМПАНИЯ. В грузе стоит тот, кто подписал
                            рейт-кон, а это менеджер: «Tyler Simpson» вместо C.H. Robinson.
                            Название из реестра точнее, а люди — ниже, своим списком. */}
                        <span className="truncate text-[14px] font-medium">
                          {prettyCompany(b.registryName) ?? b.name ?? '—'}
                        </span>
                        <span className="shrink-0 rounded-full bg-white/8 px-2 py-0.5 text-[11px] text-white/60">
                          {b.mc ? `MC ${b.mc}` : t(locale, 'brokers.noMc')}
                        </span>
                        {b.authorityStatus && (
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              b.authorityStatus === 'active'
                                ? 'bg-good-500/15 text-good-400'
                                : 'bg-bad-500/15 text-bad-400'
                            }`}
                          >
                            {b.authorityStatus === 'active'
                              ? t(locale, 'brokers.statusActive')
                              : t(locale, 'brokers.statusInactive')}
                          </span>
                        )}
                        {/* Кто реально платит: рейт-кон почти всегда называет платёжный
                            сервис, а публичного справочника «MC → факторинг» не существует. */}
                        {b.payVia && (
                          <span className="shrink-0 rounded-full bg-haul-500/15 px-2 py-0.5 text-[10px] font-medium text-haul-300">
                            {t(locale, 'brokers.payVia').replace('{name}', b.payVia)}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 text-[12px] text-white/45">
                        {/* Один представитель — показываем прямо здесь: разворачивать
                            список ради одной строки незачем. Несколько — уходят в
                            свёрнутый список ниже, иначе шапка карточки превращается в
                            свалку из пяти почт. */}
                        {b.reps.length <= 1 && b.phone && (
                          <a href={`tel:${b.phone.replace(/[^+\d]/g, '')}`} className="hover:text-white hover:underline">
                            {b.phone}
                          </a>
                        )}
                        {b.reps.length <= 1 && b.email && (
                          <a href={`mailto:${b.email}`} className="truncate hover:text-white hover:underline">
                            {b.email}
                          </a>
                        )}
                        {b.loadCount > 0 && b.name ? (
                          <Link
                            href={`/loads?q=${encodeURIComponent(b.name)}`}
                            className="hover:text-white hover:underline"
                          >
                            {t(locale, 'brokers.loadsCount').replace('{n}', String(b.loadCount))}
                          </Link>
                        ) : (
                          <span>{t(locale, 'brokers.loadsCount').replace('{n}', String(b.loadCount))}</span>
                        )}
                        {b.lastLoad && <span>{t(locale, 'brokers.lastLoad').replace('{date}', b.lastLoad)}</span>}
                      </div>
                      {/* Деньги отдельной строкой: справочник говорит, существует ли
                          брокер, а работать с ним или нет — решается вот этими цифрами.
                          Срок оплаты тут фактический, а не обещанный в рейт-коне. */}
                      {b.loadCount > 0 && (
                        <div className="nums mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px]">
                          <span className="text-white/60">
                            {t(locale, 'brokers.gross').replace('{sum}', usd.format(b.gross))}
                          </span>
                          {b.rpm > 0 && (
                            <span className={b.rpm >= 2 ? 'text-good-400' : b.rpm >= 1.5 ? 'text-white/60' : 'text-warn-400'}>
                              {t(locale, 'brokers.rpm').replace('{v}', usd2.format(b.rpm))}
                            </span>
                          )}
                          {b.payDays != null && (
                            <span className={b.payDays <= 30 ? 'text-white/60' : 'text-warn-400'}>
                              {t(locale, 'brokers.paysIn').replace('{n}', String(b.payDays))}
                            </span>
                          )}
                          {/* Долг — кнопка: под ней сами неоплаченные рейсы, и оплата
                              отмечается там же. Деньги приходят одной суммой за
                              несколько рейсов, а раньше на это уходило столько же
                              открытых страниц, сколько рейсов в переводе. */}
                          {b.owed > 0 && (
                            <button
                              type="button"
                              onClick={() => setOwedFor(owedFor === rowKey ? null : rowKey)}
                              className="rounded-full bg-warn-500/15 px-2 py-0.5 font-medium text-warn-400 transition-colors hover:bg-warn-500/25"
                            >
                              {t(locale, 'brokers.owes').replace('{sum}', usd.format(b.owed))}
                              <span className="ml-1 text-warn-400/70">{owedFor === rowKey ? '▾' : '▸'}</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    {/* Правка руками: и реестр, и разбор документа ошибаются — не тот
                        MC, телефон менеджера вместо офиса, почта, на которую счёт не
                        примут. Правка идёт по всей истории брокера, иначе её пришлось
                        бы повторять в каждом грузе. */}
                    <button
                      type="button"
                      onClick={() => setEditFor(editFor === rowKey ? null : rowKey)}
                      className="shrink-0 rounded-lg border border-white/10 px-2.5 py-1 text-[12px] text-white/70 transition-colors hover:border-haul-500/50 hover:text-haul-300"
                    >
                      {editFor === rowKey ? t(locale, 'brokers.editClose') : t(locale, 'brokers.edit')}
                    </button>
                    {b.mc && (
                      <button
                        type="button"
                        onClick={() => check('mc', b.mc!)}
                        className="shrink-0 rounded-lg border border-white/10 px-2.5 py-1 text-[12px] text-white/70 transition-colors hover:border-haul-500/50 hover:text-haul-300"
                      >
                        {t(locale, 'brokers.recheck')}
                      </button>
                    )}

                    {/* Представители — свёрнуты. Разворачивать нечего, если он один:
                        такой уже показан строкой выше. */}
                    {b.reps.length > 1 && (
                      <details className="w-full">
                        <summary className="cursor-pointer list-none text-[11.5px] text-white/45 hover:text-white/70">
                          <span className="text-white/30">▸ </span>
                          {t(locale, 'brokers.reps').replace('{n}', String(b.reps.length))}
                        </summary>
                        <ul className="mt-1 flex flex-col gap-0.5 rounded-lg border border-white/8 bg-ink-950/40 p-1.5">
                          {b.reps.map((p, i) => (
                            <li
                              key={(p.email ?? p.name ?? '') + i}
                              className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 rounded px-1.5 py-1 text-[12px] hover:bg-white/5"
                            >
                              <span className="min-w-0 truncate font-medium text-white/80">{p.name ?? '—'}</span>
                              {p.email && (
                                <a href={`mailto:${p.email}`} className="min-w-0 truncate text-white/50 hover:text-white hover:underline">
                                  {p.email}
                                </a>
                              )}
                              {p.phone && (
                                <a
                                  href={`tel:${p.phone.replace(/[^+\d]/g, '')}`}
                                  className="nums text-white/50 hover:text-white hover:underline"
                                >
                                  {p.phone}
                                </a>
                              )}
                              <span className="nums ml-auto shrink-0 text-white/35">
                                {t(locale, 'brokers.repLoads').replace('{n}', String(p.loads))}
                                {p.lastAt ? ` \u00b7 ${p.lastAt}` : ''}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}

                    {owedFor === rowKey && b.unpaid.length > 0 && (
                      <ul className="w-full rounded-lg border border-white/10 bg-ink-950/60 p-2">
                        {b.unpaid.map((u) => (
                          <li
                            key={u.id}
                            className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-1.5 py-1 hover:bg-white/5"
                          >
                            <Link
                              href={`/loads/${u.id}`}
                              className="min-w-0 flex-1 truncate text-[12.5px] text-white/80 hover:underline"
                            >
                              {u.route}
                              {u.ref ? ` · ${u.ref}` : ''}
                            </Link>
                            <span className="nums text-[12.5px] font-semibold text-white/85">{usd.format(u.rate)}</span>
                            {/* Сколько ждём денег по ЭТОМУ счёту: 20 дней и 70 — разный
                                разговор с брокером, а в общей сумме долга это не видно. */}
                            <span className={`nums text-[11.5px] ${u.days > 30 ? 'text-warn-400' : 'text-white/45'}`}>
                              {t(locale, 'brokers.waitingDays').replace('{n}', String(u.days))}
                            </span>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => pay(u.id)}
                              className="rounded-lg border border-good-500/40 px-2 py-0.5 text-[11.5px] font-medium text-good-400 transition-colors hover:bg-good-500/15 disabled:opacity-50"
                            >
                              {t(locale, 'brokers.markPaid')}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}

                    {editFor === rowKey && (
                      <BrokerEdit
                        broker={b}
                        onDone={() => {
                          setEditFor(null)
                          router.refresh()
                        }}
                      />
                    )}
                  </li>
                  )
                })}
              </ul>
            )}
          </>
        )}
      </section>

      {/* ── Check form ─────────────────────────────────────── */}
      <section className="panel mt-4 p-5">
        <h2 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
          {t(locale, 'brokers.checkHeading')}
          <Info text={t(locale, 'brokers.checkInfo')} />
        </h2>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-xl border border-white/10">
            {(['mc', 'dot'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setBy(k)}
                className={`px-3 py-2 text-[13px] font-medium transition-colors ${
                  by === k ? 'bg-haul-500 text-white' : 'text-white/60 hover:text-white/85'
                }`}
              >
                {t(locale, k === 'mc' ? 'brokers.byMc' : 'brokers.byDot')}
              </button>
            ))}
          </div>
          <input
            value={value}
            inputMode="numeric"
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && check(by, value)}
            placeholder={t(locale, by === 'mc' ? 'brokers.mcPlaceholder' : 'brokers.dotPlaceholder')}
            className={`${input} max-w-[240px] flex-1`}
          />
          <button
            type="button"
            onClick={() => check(by, value)}
            disabled={state === 'loading' || !value.trim()}
            className="rounded-xl bg-haul-500 px-4 py-2 text-[13px] font-semibold transition-colors hover:bg-haul-400 disabled:opacity-50"
          >
            {state === 'loading' ? t(locale, 'brokers.checking') : t(locale, 'brokers.checkButton')}
          </button>
        </div>

        {state === 'nokey' && (
          <p className="mt-3 rounded-lg bg-warn-400/10 px-3 py-2 text-[12.5px] leading-relaxed text-warn-400">
            {t(locale, 'brokers.noKey')}
          </p>
        )}
        {state === 'error' && <p className="mt-3 text-[13px] text-bad-400">{err}</p>}
        {state === 'done' && data && <BrokerChecklist check={data} />}
      </section>

      {/* ── Largest brokers (reference) ────────────────────── */}
      <section className="panel mt-4 p-5">
        <h2 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
          {t(locale, 'brokers.topHeading')}
          <Info text={t(locale, 'brokers.topInfo')} />
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {topBrokers.map((b) => (
            <button
              key={b.name}
              type="button"
              onClick={() => setHistory(b)}
              className="rounded-full border border-white/8 bg-white/[0.02] px-2.5 py-1 text-[12px] text-white/70 transition-colors hover:border-haul-500/50 hover:text-white"
            >
              {b.name}
              <span className="ml-1.5 text-white/35">{b.hq}</span>
            </button>
          ))}
        </div>
      </section>

      {/* History bubble — click a broker chip to read who they are. */}
      {history && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setHistory(null)}
        >
          <div
            className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-ink-900 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setHistory(null)}
              aria-label={t(locale, 'brokers.close')}
              className="absolute right-3 top-3 flex size-7 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white"
            >
              ✕
            </button>
            <h3 className="pr-8 text-[17px] font-semibold">{history.name}</h3>
            <p className="mt-0.5 text-[12px] uppercase tracking-wider text-white/40">{history.hq}</p>
            {/* Реквизиты идут ВЫШЕ истории: история — это «кто они», а работать надо с
                номером. В самом списке их не хранят намеренно — вписанный руками MC
                устаревает и врёт, поэтому он тянется из реестра на месте. */}
            <TopBrokerFacts name={history.name} />
            <p className="mt-3 text-[13.5px] leading-relaxed text-white/75">
              {locale === 'en' ? history.historyEn : history.history}
            </p>
          </div>
        </div>
      )}
    </>
  )
}

/**
 * Правка данных брокера. Меняет их сразу во ВСЕЙ его истории, а не в одном грузе:
 * неверный MC или почта, на которую не примут счёт, приезжают из документа один раз,
 * а мешают потом всегда.
 *
 * Пустое поле = «оставить как есть». Форма показывает все четыре поля сразу, и
 * очищенное поле почти всегда значит «этого я не знаю», а не «сотри то, что было».
 */
function BrokerEdit({ broker, onDone }: { broker: OurBroker; onDone: () => void }) {
  const locale = useLocale()
  const [mc, setMc] = useState(broker.mc ?? '')
  const [name, setName] = useState(broker.name ?? '')
  const [phone, setPhone] = useState(broker.phone ?? '')
  const [email, setEmail] = useState(broker.email ?? '')
  const [saving, setSaving] = useState(false)

  const field =
    'w-full rounded-lg border border-white/10 bg-ink-950/70 px-2.5 py-1.5 text-[13px] text-white outline-none focus:border-haul-500'

  async function save() {
    setSaving(true)
    const res = await updateBrokerInfo(
      { mc: broker.mc, name: broker.name },
      { mc, name, phone, email },
    )
    setSaving(false)
    if ('error' in res) {
      notify('error', res.error)
      return
    }
    notify('ok', t(locale, 'brokers.editSaved').replace('{n}', String(res.updated)))
    onDone()
  }

  return (
    <div className="w-full rounded-lg border border-white/10 bg-ink-950/60 p-2.5">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-0.5 block text-[11px] text-white/45">{t(locale, 'brokers.editName')}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={field} />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[11px] text-white/45">{t(locale, 'brokers.editMc')}</span>
          <input
            value={mc}
            onChange={(e) => setMc(e.target.value)}
            inputMode="numeric"
            placeholder="123456"
            className={`${field} nums`}
          />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[11px] text-white/45">{t(locale, 'brokers.editPhone')}</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className={field} />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[11px] text-white/45">{t(locale, 'brokers.editEmail')}</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            inputMode="email"
            className={field}
          />
        </label>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="rounded-lg bg-haul-500 px-3 py-1.5 text-[12.5px] font-semibold transition-colors hover:bg-haul-400 disabled:opacity-50"
        >
          {saving ? t(locale, 'brokers.editSaving') : t(locale, 'brokers.editSave')}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-white/10 px-3 py-1.5 text-[12.5px] text-white/70 transition-colors hover:border-white/25 hover:text-white"
        >
          {t(locale, 'brokers.editCancel')}
        </button>
        {/* Правка расходится по всем грузам брокера — это стоит сказать заранее, а не
            показывать числом уже после сохранения. */}
        <span className="text-[11.5px] text-white/40">
          {t(locale, 'brokers.editScope').replace('{n}', String(broker.loadCount))}
        </span>
      </div>
    </div>
  )
}


type Facts = Awaited<ReturnType<typeof topBrokerInfo>>

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

  if (!facts) {
    return <p className="mt-2 text-[12px] text-white/35">{t(locale, 'brokers.factsLoading')}</p>
  }
  if ('error' in facts) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-white/40">
        <span>{facts.error === 'no_key' ? t(locale, 'brokers.factsNoKey') : facts.error}</span>
        {/* Сбой почти всегда разовый: реестр не ответил или вкладка стояла открытой
            со старой сборки. Повтор решает оба случая, и он должен быть под рукой,
            а не через перезагрузку страницы. */}
        <button
          type="button"
          onClick={() => setAttempt((n) => n + 1)}
          className="rounded-lg border border-white/12 px-2 py-0.5 font-medium text-white/70 transition-colors hover:border-haul-500/50 hover:text-haul-300"
        >
          {t(locale, 'brokers.factsRetry')}
        </button>
      </div>
    )
  }

  const cell = (label: string, value: string | null) =>
    value ? (
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-white/35">{label}</div>
        <div className="nums truncate text-[13px] text-white/85">{value}</div>
      </div>
    ) : null

  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-ink-950/60 p-3">
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        {cell('MC', facts.mc)}
        {cell('DOT', facts.dot)}
        {cell(
          t(locale, 'brokers.factsAuthority'),
          facts.authority
            ? facts.authority === 'active'
              ? t(locale, 'brokers.statusActive')
              : t(locale, 'brokers.statusInactive')
            : null,
        )}
        {cell(t(locale, 'brokers.factsCity'), facts.city ? `${facts.city}, ${facts.state ?? ''}` : null)}
      </div>
      {facts.phone && (
        <a
          href={`tel:${facts.phone.replace(/[^+\d]/g, '')}`}
          className="nums mt-2 block text-[13px] text-haul-300 hover:underline"
        >
          {facts.phone}
        </a>
      )}
      {/* Юридическое имя отличается от того, под которым брокера знают, и в счёте
          нужно именно оно. */}
      {facts.legalName && facts.legalName.toLowerCase() !== name.toLowerCase() && (
        <p className="mt-1.5 text-[11.5px] text-white/40">{facts.legalName}</p>
      )}
    </div>
  )
}


/** Название из реестра пишут капсом: «CH ROBINSON COMPANY LLC». Читать это в списке
 * тяжело, поэтому приводим к обычному виду, оставляя заглавными короткие слова —
 * формы собственности и инициалы («LLC», «CH»), которые иначе превращаются в «Llc». */
function prettyCompany(name: string | null): string | null {
  if (!name) return null
  if (!/[A-Z]{4,}/.test(name)) return name
  return name
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length <= 3 && w !== 'inc' ? w.toUpperCase() : w.replace(/^./, (c) => c.toUpperCase())))
    .join(' ')
}
