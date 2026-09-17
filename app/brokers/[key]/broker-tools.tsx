'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { runBrokerCheck, updateBrokerInfo } from '@/app/actions'
import type { BrokerCheck } from '@/lib/fmcsa'
import { brokerKeyOf } from '@/lib/broker-key'
import { BrokerChecklist } from '@/components/broker-checklist'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

type Tools = {
  key: string
  mc: string | null
  name: string | null
  phone: string | null
  email: string | null
  loadCount: number
  authorityStatus: string | null
  checked: string | null
}

const btn =
  'inline-flex min-h-9 items-center rounded-lg border border-white/10 px-3 text-[12.5px] text-white/70 transition-colors hover:border-haul-500/50 hover:text-haul-300 disabled:opacity-50 max-md:min-h-11'

/** Реестр FMCSA и правка данных брокера — строкой под названием карточки. */
export function BrokerTools({ broker }: { broker: Tools }) {
  const locale = useLocale()
  const router = useRouter()
  const [open, setOpen] = useState<'check' | 'edit' | null>(null)
  const [check, setCheck] = useState<BrokerCheck | null>(null)
  const [err, setErr] = useState('')
  const [busy, start] = useTransition()

  const runCheck = () => {
    if (!broker.mc) return
    setOpen('check')
    setErr('')
    setCheck(null)
    start(async () => {
      const res = await runBrokerCheck('mc', broker.mc!)
      if ('error' in res) setErr(res.error === 'no_key' ? t(locale, 'brokers.noKey') : res.error)
      else {
        setCheck(res)
        router.refresh()
      }
    })
  }

  const status = broker.authorityStatus
    ? broker.authorityStatus === 'active'
      ? { text: `authority ${t(locale, 'brokers.statusActive')}`, cls: 'bg-good-500/15 text-good-400' }
      : { text: `authority ${t(locale, 'brokers.statusInactive')}`, cls: 'bg-bad-500/15 text-bad-400' }
    : { text: t(locale, 'brokers.card.notChecked'), cls: 'bg-white/8 text-white/60' }

  return (
    <div className="mt-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`nums rounded-full px-2.5 py-1 text-[12px] font-medium ${status.cls}`}>
          FMCSA: {status.text}
          {broker.checked && ` · ${t(locale, 'brokers.dir.checked').replace('{date}', broker.checked)}`}
        </span>
        {broker.mc && (
          <button type="button" onClick={runCheck} disabled={busy} className={btn}>
            {busy ? t(locale, 'brokers.checking') : t(locale, 'brokers.checkButton')}
          </button>
        )}
        <button type="button" onClick={() => setOpen(open === 'edit' ? null : 'edit')} className={btn}>
          {open === 'edit' ? t(locale, 'brokers.editClose') : t(locale, 'brokers.edit')}
        </button>
      </div>
      {open === 'check' && err && <p className="mt-2 text-[13px] text-warn-400">{err}</p>}
      {open === 'check' && check && <BrokerChecklist check={check} />}
      {open === 'edit' && (
        <BrokerEdit
          broker={broker}
          onCancel={() => setOpen(null)}
          onSaved={(nextKey) => {
            setOpen(null)
            // Сменился MC или название — у карточки новый адрес.
            if (nextKey && nextKey !== broker.key) router.replace(`/brokers/${encodeURIComponent(nextKey)}`)
            else router.refresh()
          }}
        />
      )}
    </div>
  )
}

/**
 * Правка данных брокера — сразу во ВСЕЙ его истории, а не в одном грузе: неверный MC или
 * почта, на которую не примут счёт, приходят из документа один раз, а мешают всегда.
 * Пустое поле = «оставить как есть».
 */
function BrokerEdit({ broker, onCancel, onSaved }: { broker: Tools; onCancel: () => void; onSaved: (nextKey: string | null) => void }) {
  const locale = useLocale()
  const [mc, setMc] = useState(broker.mc ?? '')
  const [name, setName] = useState(broker.name ?? '')
  const [phone, setPhone] = useState(broker.phone ?? '')
  const [email, setEmail] = useState(broker.email ?? '')
  const [saving, setSaving] = useState(false)
  const field =
    'w-full rounded-lg border border-white/10 bg-ink-950/70 px-2.5 py-1.5 text-[13px] text-white outline-none focus:border-haul-500 max-md:min-h-11'

  async function save() {
    setSaving(true)
    const res = await updateBrokerInfo({ mc: broker.mc, name: broker.name }, { mc, name, phone, email })
    setSaving(false)
    if ('error' in res) return notify('error', res.error)
    notify('ok', t(locale, 'brokers.editSaved').replace('{n}', String(res.updated)))
    onSaved(brokerKeyOf({ mc: mc.trim() || broker.mc, email: email.trim() || broker.email, name: name.trim() || broker.name }))
  }

  return (
    <div className="mt-2.5 rounded-xl border border-white/10 bg-ink-950/60 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-0.5 block text-[11px] text-white/45">{t(locale, 'brokers.editName')}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={field} />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[11px] text-white/45">{t(locale, 'brokers.editMc')}</span>
          <input value={mc} onChange={(e) => setMc(e.target.value)} inputMode="numeric" placeholder="123456" className={`${field} nums`} />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[11px] text-white/45">{t(locale, 'brokers.editPhone')}</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className={field} />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[11px] text-white/45">{t(locale, 'brokers.editEmail')}</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" className={field} />
        </label>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="min-h-9 rounded-lg bg-haul-500 px-3 text-[12.5px] font-semibold text-white hover:bg-haul-400 disabled:opacity-50 max-md:min-h-11"
        >
          {saving ? t(locale, 'brokers.editSaving') : t(locale, 'brokers.editSave')}
        </button>
        <button type="button" onClick={onCancel} className={btn}>
          {t(locale, 'brokers.editCancel')}
        </button>
        <span className="text-[11.5px] text-white/40">{t(locale, 'brokers.editScope').replace('{n}', String(broker.loadCount))}</span>
      </div>
    </div>
  )
}
