'use client'

import { useState, useTransition } from 'react'
import { saveBrokerNote, saveFacilityNote } from '@/app/actions'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

/** Заметка диспетчера о складе: часы, ворота, кому звонить. Одна строка, сохраняется
 * по кнопке; попадает водителю в «как заехать», если у груза своих указаний нет. */
export function FacilityNote({ facilityKey, note }: { facilityKey: string; note: string | null }) {
  return <NoteLine id={facilityKey} note={note} kind="facility" />
}

/** Заметка о брокере: как платит, с кем говорить — в карточке брокера. */
export function BrokerNote({ brokerKey, note }: { brokerKey: string; note: string | null }) {
  return <NoteLine id={brokerKey} note={note} kind="broker" />
}

function NoteLine({ id, note, kind }: { id: string; note: string | null; kind: 'facility' | 'broker' }) {
  const locale = useLocale()
  const [text, setText] = useState(note ?? '')
  const [editing, setEditing] = useState(false)
  const [busy, start] = useTransition()
  const broker = kind === 'broker'
  const save = () =>
    start(async () => {
      const res = await (broker ? saveBrokerNote : saveFacilityNote)(id, text)
      if (res?.error) return notify('error', res.error)
      notify('ok', t(locale, 'facilities.noteSaved'))
      setEditing(false)
    })
  if (!editing)
    return (
      <button type="button" onClick={() => setEditing(true)} className="text-left text-[12.5px] text-white/70 hover:text-white max-md:min-h-9">
        {note ? (
          <>
            <span className="font-semibold text-haul-300">{t(locale, broker ? 'brokers.note' : 'facilities.note')}:</span> {note}
          </>
        ) : (
          <span className="text-white/45">+ {t(locale, broker ? 'brokers.addNote' : 'facilities.addNote')}</span>
        )}
      </button>
    )
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && save()}
        placeholder={t(locale, broker ? 'brokers.notePlaceholder' : 'facilities.notePlaceholder')}
        autoFocus
        className="min-h-9 flex-1 rounded-lg border border-white/12 bg-white/[0.04] px-2.5 text-[13px] text-white outline-none focus:border-haul-500/60 max-md:min-h-11"
      />
      <div className="flex gap-1.5">
        <button type="button" disabled={busy} onClick={save} className="min-h-9 rounded-lg bg-haul-500 px-3 text-[12.5px] font-semibold text-white hover:bg-haul-400 disabled:opacity-50 max-md:min-h-11">
          {t(locale, 'facilities.save')}
        </button>
        <button type="button" onClick={() => setEditing(false)} className="min-h-9 rounded-lg border border-white/12 px-3 text-[12.5px] text-white/70 max-md:min-h-11">
          {t(locale, 'facilities.cancel')}
        </button>
      </div>
    </div>
  )
}
