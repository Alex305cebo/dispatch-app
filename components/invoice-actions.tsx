'use client'

import { DocLink } from '@/components/doc-link'

import { Button } from '@/components/button'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { generateInvoice, removeInvoice, saveCompany } from '@/app/actions'
import type { Company } from '@/lib/invoice'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

const input =
  'w-full rounded-xl border border-white/8 bg-ink-900/80 px-3 py-2.5 text-[14px] text-white outline-none transition-all placeholder:text-white/45 focus:border-haul-500 focus:ring-4 focus:ring-haul-500/15'

/** On the load page: generate the packet; где деньги — метка со ссылкой в «Финансы». */
export function InvoiceBox({
  loadId,
  invoiceNumber,
  invoiceDocId,
  paid,
  pay = null,
  companyReady = true,
}: {
  loadId: number
  invoiceNumber: string | null
  invoiceDocId: number | null
  paid: boolean
  /** Этап оплаты (lib/payments.ts payBadge); href null — нет доступа к «Финансам». */
  pay?: PayChip | null
  /** Are the company name + MC/DOT filled in? Without them an invoice can't be built. */
  companyReady?: boolean
}) {
  const locale = useLocale()
  const [pending, start] = useTransition()

  const gen = () =>
    start(async () => {
      const res = await generateInvoice(loadId)
      if ('error' in res) notify('error', res.error)
      else {
        notify('ok', t(locale, 'finances.invoiceBox.built').replace('{n}', res.invoiceNumber))
        window.open(`/api/docs/${res.docId}`, '_blank')
      }
    })

  // Can't invoice without your own company details — say so up front, with the way
  // to fix it, instead of failing on click with a toast that names no place.
  if (!invoiceNumber && !companyReady)
    return (
      <div className="rounded-xl border border-warn-400/30 bg-warn-400/[0.07] p-3.5">
        <p className="text-[13px] font-medium text-warn-200">{t(locale, 'finances.gate.title')}</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-white/70">
          {t(locale, 'finances.gate.body1')}
          <b>{t(locale, 'finances.gate.companyName')}</b>
          {t(locale, 'finances.gate.and')}
          <b>{t(locale, 'finances.gate.mcdot')}</b>
          {t(locale, 'finances.gate.body2')}
        </p>
        <Link
          href="/admin#company"
          className="mt-2.5 inline-block rounded-lg bg-warn-400 px-3.5 py-1.5 text-[12px] font-semibold text-ink-950 transition-colors hover:bg-warn-300"
        >
          {t(locale, 'finances.gate.cta')}
        </Link>
      </div>
    )

  if (!invoiceNumber)
    return (
      <Button variant="primary" disabled={pending}
        onClick={gen}>
        {pending ? t(locale, 'finances.invoiceBox.building') : t(locale, 'finances.invoiceBox.generate')}
      </Button>
    )

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-[13px] font-medium">{invoiceNumber}</span>
      {invoiceDocId && (
        <DocLink
          docId={invoiceDocId}
          className="rounded-lg border border-white/10 px-3 py-1.5 text-[12px] font-semibold text-white/85 hover:bg-white/5"
        >
          {t(locale, 'finances.invoiceBox.open')}
        </DocLink>
      )}
      {pay && <PayChipView pay={pay} className="rounded-lg px-3 py-1.5 text-[12px] font-semibold" />}
      <button onClick={gen} disabled={pending} className="text-[12px] text-white/45 hover:text-white/75">
        {t(locale, 'finances.invoiceBox.rebuild')}
      </button>
      {/* Счёт выписался раньше времени (промежуточный POD приняли за конечный) —
          снять его можно здесь, а не руками в базе. У оплаченного счёта кнопки нет. */}
      {!paid && (
        <button
          disabled={pending}
          onClick={() => {
            if (!confirm(t(locale, 'finances.invoiceBox.removeConfirm'))) return
            start(async () => {
              const res = await removeInvoice(loadId)
              if (res && 'error' in res) notify('error', res.error)
              else notify('ok', t(locale, 'finances.invoiceBox.removed'))
            })
          }}
          className="text-[12px] text-white/45 transition-colors hover:text-bad-400"
        >
          {t(locale, 'finances.invoiceBox.remove')}
        </button>
      )}
    </div>
  )
}

/** Где деньги за груз — метка; с доступом к «Финансам» ведёт туда. Отмечает оплату
 * только бухгалтер на вкладке «Оплата · факторинг». */
export type PayChip = { href: string | null; label: string; tone: 'good' | 'warn' | 'bad' | 'plain' }

const PAY_TONE = {
  good: 'bg-good-500/15 text-good-400 ring-good-400/30',
  warn: 'bg-warn-400/15 text-warn-400 ring-warn-400/40',
  bad: 'bg-bad-500/15 text-bad-400 ring-bad-500/40',
  plain: 'bg-white/[0.06] text-white/70 ring-white/15',
} as const

export function PayChipView({ pay, className }: { pay: PayChip; className: string }) {
  const cls = `${className} ring-1 ${PAY_TONE[pay.tone]}`
  return pay.href ? (
    <Link href={pay.href} className={`${cls} transition-colors hover:brightness-125`}>
      {pay.label} →
    </Link>
  ) : (
    <span className={cls}>{pay.label}</span>
  )
}

export function CompanyForm({ initial }: { initial: Company }) {
  const router = useRouter()
  const locale = useLocale()
  const [c, setC] = useState<Company>(initial)
  const [pending, start] = useTransition()
  const f = (k: keyof Company) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setC({ ...c, [k]: e.target.value })

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {/* Подпись НАД каждым полем, а не только плейсхолдер: заполненная форма
          превращалась в шесть безымянных значений — где MC, где телефон, где
          владелец, приходилось угадывать по формату. */}
      {(
        [
          ['name', 'finances.form.name'],
          ['mcdot', 'finances.form.mcdot'],
          ['owner', 'finances.form.owner'],
          ['phone', 'finances.form.phone'],
          ['email', 'finances.form.email'],
          ['address', 'finances.form.address'],
        ] as const
      ).map(([k, key]) => (
        <label key={k}>
          <span className="mb-1 block text-xs text-white/65 font-medium">
            {t(locale, key)}
          </span>
          <input value={c[k]} onChange={f(k)} className={input} />
        </label>
      ))}
      <label className="sm:col-span-2">
        <span className="mb-1 block text-xs text-white/65 font-medium">
          {t(locale, 'finances.form.remitTo')}
        </span>
        <textarea value={c.remitTo} onChange={f('remitTo')} rows={2} className={input} />
        <span className="mt-1 block text-[11.5px] leading-relaxed text-white/50">
          {t(locale, 'finances.form.remitToHint')}
        </span>
      </label>
      <div className="sm:col-span-2">
        <Button variant="primary" disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await saveCompany(c)
              if (res?.error) notify('error', res.error)
              else {
                notify('ok', t(locale, 'finances.form.saved'))
              }
            })
          }>
          {t(locale, 'finances.form.save')}
        </Button>
      </div>
    </div>
  )
}
