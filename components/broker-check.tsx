'use client'

// Broker vetting panel — fires FMCSA lookup once fields are parsed, shows
// authority / bond / MC-age and any red flags. Auto-runs when an MC is present.

import { useEffect, useState } from 'react'
import { vetBroker } from '@/app/actions'
import type { BrokerCheck } from '@/lib/fmcsa'
import type { RateConFields } from '@/lib/ratecon'
import { Info } from '@/components/info'

export function BrokerCheckPanel({ fields }: { fields: RateConFields }) {
  const mc = fields.mcNumber?.value
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'nokey' | 'error'>('idle')
  const [data, setData] = useState<BrokerCheck | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!mc) return
    let alive = true
    setState('loading')
    vetBroker(mc, {
      name: null, // broker name isn't a distinct field yet; phone/email are the signals
      phone: fields.brokerPhone?.value ?? null,
      email: fields.brokerEmail?.value ?? null,
    }).then((res) => {
      if (!alive) return
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
    return () => {
      alive = false
    }
  }, [mc, fields.brokerPhone?.value, fields.brokerEmail?.value])

  if (!mc) return null

  return (
    <div className="panel mb-4 p-4">
      <div className="flex items-center gap-2">
        <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
          Проверка брокера · MC {mc}
          <Info text="По номеру MC проверяем брокера в базе FMCSA: активны ли его полномочия, есть ли страховой бонд, сколько лет MC. Плюс автоматические красные флаги мошенничества (нет бонда, молодой MC, публичный email, несовпадение телефона). Красный ⛔ — не бери груз." />
        </h2>
        {state === 'loading' && (
          <span className="animate-pulse text-[11px] text-haul-400">проверяю в FMCSA…</span>
        )}
      </div>

      {state === 'nokey' && (
        <p className="mt-2 text-[12px] leading-relaxed text-white/55">
          Проверка отключена — нет ключа FMCSA. Заведи бесплатный WebKey на
          mobile.fmcsa.dot.gov/QCDevsite и добавь <code className="text-white/75">FMCSA_WEBKEY</code>.
        </p>
      )}
      {state === 'error' && <p className="mt-2 text-[13px] text-bad-400">{err}</p>}

      {state === 'done' && data && (
        <div className="mt-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
            <span className="font-medium">{data.legalName ?? '—'}</span>
            <Badge
              ok={data.authorityStatus === 'active'}
              text={
                data.authorityStatus === 'active'
                  ? 'Authority ACTIVE'
                  : `Authority ${data.authorityStatus.toUpperCase()}`
              }
            />
            {data.bondOnFile !== null && (
              <Badge ok={data.bondOnFile} text={data.bondOnFile ? 'Бонд: есть' : 'Бонд: НЕТ'} />
            )}
            {data.authorityGranted && (
              <span className="text-white/55">выдана {data.authorityGranted}</span>
            )}
          </div>
          {data.address && <p className="mt-1 text-[12px] text-white/50">{data.address}</p>}

          {data.flags.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1.5">
              {data.flags.map((f, i) => (
                <li
                  key={i}
                  className={`rounded-lg px-3 py-2 text-[13px] ${
                    f.level === 'block'
                      ? 'bg-bad-500/12 text-bad-400'
                      : 'bg-warn-400/12 text-warn-400'
                  }`}
                >
                  {f.level === 'block' ? '⛔ ' : '⚠ '}
                  {f.text}
                </li>
              ))}
            </ul>
          )}
          {data.flags.length === 0 && (
            <p className="mt-2 text-[12px] text-good-400">✓ Красных флагов нет.</p>
          )}
        </div>
      )}
    </div>
  )
}

function Badge({ ok, text }: { ok: boolean; text: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
        ok ? 'bg-good-500/15 text-good-400' : 'bg-bad-500/15 text-bad-400'
      }`}
    >
      {text}
    </span>
  )
}
