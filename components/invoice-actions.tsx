'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { generateInvoice, markPaid, saveCompany } from '@/app/actions'
import type { Company } from '@/lib/invoice'
import { notify } from '@/lib/notify'

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
  const router = useRouter()
  const [pending, start] = useTransition()

  const gen = () =>
    start(async () => {
      const res = await generateInvoice(loadId)
      if ('error' in res) notify('error', res.error)
      else {
        notify('ok', `Инвойс ${res.invoiceNumber} собран`)
        window.open(`/api/docs/${res.docId}`, '_blank')
        router.refresh()
      }
    })

  const toggle = (v: boolean) =>
    start(async () => {
      await markPaid(loadId, v)
      notify('ok', v ? 'Отмечено оплаченным' : 'Снята отметка оплаты')
      router.refresh()
    })

  // Can't invoice without your own company details — say so up front, with the way
  // to fix it, instead of failing on click with a toast that names no place.
  if (!invoiceNumber && !companyReady)
    return (
      <div className="rounded-xl border border-warn-400/30 bg-warn-400/[0.07] p-3.5">
        <p className="text-[13px] font-medium text-warn-200">
          Сначала заполни данные своей компании
        </p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-white/70">
          Они печатаются в счёте, который уходит брокеру: <b>название компании</b> и{' '}
          <b>MC/DOT</b> — это номер твоей перевозочной авторизации (из бумаг FMCSA, тот же,
          что в договоре с брокером). Без них брокеру некуда и некому платить.
        </p>
        <Link
          href="/invoices"
          className="mt-2.5 inline-block rounded-lg bg-warn-400 px-3.5 py-1.5 text-[12px] font-semibold text-ink-950 transition-colors hover:bg-warn-300"
        >
          Заполнить данные компании →
        </Link>
      </div>
    )

  if (!invoiceNumber)
    return (
      <button
        disabled={pending}
        onClick={gen}
        className="rounded-xl bg-haul-500 px-4 py-2 text-[13px] font-semibold transition-colors hover:bg-haul-400 disabled:opacity-50"
      >
        {pending ? 'Собираю пакет…' : 'Сгенерировать инвойс + пакет'}
      </button>
    )

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-[13px] font-medium">{invoiceNumber}</span>
      {invoiceDocId && (
        <a
          href={`/view/${invoiceDocId}`}
          className="rounded-lg border border-white/10 px-3 py-1.5 text-[12px] font-semibold text-white/85 hover:bg-white/5"
        >
          Открыть пакет
        </a>
      )}
      <button
        disabled={pending}
        onClick={() => toggle(!paid)}
        className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors ${
          paid ? 'bg-good-500/20 text-good-400' : 'bg-haul-500 text-white hover:bg-haul-400'
        }`}
      >
        {paid ? '✓ Оплачено' : 'Отметить оплаченным'}
      </button>
      <button onClick={gen} disabled={pending} className="text-[12px] text-white/45 hover:text-white/75">
        пересобрать
      </button>
    </div>
  )
}

/** Mark-paid toggle used in the AR list. */
export function PaidToggle({ loadId }: { loadId: number }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <button
      disabled={pending}
      onClick={() =>
        start(async () => {
          await markPaid(loadId, true)
          notify('ok', 'Оплачено')
          router.refresh()
        })
      }
      className="shrink-0 rounded-lg bg-haul-500 px-3 py-1.5 text-[12px] font-semibold transition-colors hover:bg-haul-400 disabled:opacity-50"
    >
      Оплачено
    </button>
  )
}

export function CompanyForm({ initial }: { initial: Company }) {
  const router = useRouter()
  const [c, setC] = useState<Company>(initial)
  const [pending, start] = useTransition()
  const f = (k: keyof Company) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setC({ ...c, [k]: e.target.value })

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <input value={c.name} onChange={f('name')} placeholder="Название компании" className={input} />
      <input value={c.owner} onChange={f('owner')} placeholder="Владелец (босс)" className={input} />
      <input value={c.mcdot} onChange={f('mcdot')} placeholder="MC / DOT #" className={input} />
      <input value={c.address} onChange={f('address')} placeholder="Адрес" className={input} />
      <input value={c.phone} onChange={f('phone')} placeholder="Телефон" className={input} />
      <input value={c.email} onChange={f('email')} placeholder="Email" className={input} />
      <label className="sm:col-span-2">
        <span className="mb-1 block text-[11px] uppercase tracking-wider text-white/55">
          Remit-to (если возит факторинг — их адрес; пусто = платят напрямую)
        </span>
        <textarea value={c.remitTo} onChange={f('remitTo')} rows={2} className={input} />
      </label>
      <div className="sm:col-span-2">
        <button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await saveCompany(c)
              if (res?.error) notify('error', res.error)
              else {
                notify('ok', 'Данные компании сохранены')
                router.refresh()
              }
            })
          }
          className="rounded-xl bg-haul-500 px-4 py-2 text-[13px] font-semibold transition-colors hover:bg-haul-400 disabled:opacity-50"
        >
          Сохранить компанию
        </button>
      </div>
    </div>
  )
}
