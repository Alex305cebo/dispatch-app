'use client'

import { DocLink } from '@/components/doc-link'

import { Button } from '@/components/button'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { generateInvoice, markPaid, saveCompany } from '@/app/actions'
import type { Company } from '@/lib/invoice'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

const input =
  'w-full rounded-xl border border-white/8 bg-ink-900/80 px-3 py-2.5 text-[14px] text-white outline-none transition-all placeholder:text-white/45 focus:border-haul-500 focus:ring-4 focus:ring-haul-500/15'

/** On the load page: generate the packet, or (once invoiced) mark paid. */
export function InvoiceBox({
  loadId,
  invoiceNumber,
  invoiceDocId,
  paid,
  companyReady = true,
}: {
  loadId: number
  invoiceNumber: string | null
  invoiceDocId: number | null
  paid: boolean
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

  const toggle = (v: boolean) =>
    start(async () => {
      await markPaid(loadId, v)
      notify('ok', v ? t(locale, 'finances.invoiceBox.marked') : t(locale, 'finances.invoiceBox.unmarked'))
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
      <button
        disabled={pending}
        onClick={() => toggle(!paid)}
        className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors ${
          paid ? 'bg-good-500/20 text-good-400' : 'bg-haul-500 text-white hover:bg-haul-400'
        }`}
      >
        {paid ? t(locale, 'finances.invoiceBox.paidBadge') : t(locale, 'finances.invoiceBox.markPaid')}
      </button>
      <button onClick={gen} disabled={pending} className="text-[12px] text-white/45 hover:text-white/75">
        {t(locale, 'finances.invoiceBox.rebuild')}
      </button>
    </div>
  )
}

/** Mark-paid toggle used in the AR list — also doubles as the "Оплачено" tab's
 * undo (paid=true flips it back to unpaid instead). */
export function PaidToggle({ loadId, paid = false }: { loadId: number; paid?: boolean }) {
  const router = useRouter()
  const locale = useLocale()
  const [pending, start] = useTransition()
  return (
    <button
      disabled={pending}
      onClick={() =>
        start(async () => {
          await markPaid(loadId, !paid)
          notify('ok', paid ? t(locale, 'finances.paidToggle.unmarked') : t(locale, 'finances.paidToggle.marked'))
        })
      }
      className={`shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-50 ${
        paid
          ? 'border border-white/10 text-white/60 hover:border-white/25 hover:text-white'
          : 'bg-haul-500 hover:bg-haul-400'
      }`}
    >
      {paid ? t(locale, 'finances.paidToggle.remove') : t(locale, 'finances.paidToggle.marked')}
    </button>
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
          <span className="mb-1 block text-[11px] uppercase tracking-wider text-white/55">
            {t(locale, key)}
          </span>
          <input value={c[k]} onChange={f(k)} className={input} />
        </label>
      ))}
      <label className="sm:col-span-2">
        <span className="mb-1 block text-[11px] uppercase tracking-wider text-white/55">
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
