'use client'

import { Button } from '@/components/button'
// Guarded delete: a ✕ that opens a confirm where the word DELETE is typed out, then
// calls a server action (id, confirm). Used for documents, loads, maintenance and
// todos — anything whose removal must land in the Log. Who did it comes from the
// session, so there is no "who deleted it" field to type; the typed word is the
// deliberate pause before something irreversible.

import { useState, useTransition } from 'react'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'
import { DELETE_WORD } from '@/lib/delete-word'

export function DeleteButton({
  action,
  id,
  title,
  note,
}: {
  action: (id: number, confirm: string) => Promise<{ error?: string } | void>
  id: number
  title: string
  note?: string // e.g. "and its calculations will be gone for good."
}) {
  const locale = useLocale()
  const [open, setOpen] = useState(false)
  const [word, setWord] = useState('')
  const [err, setErr] = useState('')
  const [pending, start] = useTransition()

  function submit() {
    setErr('')
    start(async () => {
      const res = await action(id, word)
      if (res?.error) setErr(res.error)
      else {
        notify('ok', t(locale, 'deleteButton.deleted'), title)
        setOpen(false)
        setWord('')
      }
    })
  }

  const field =
    'w-full rounded-xl border border-white/10 bg-ink-950/70 px-3 py-2 text-[14px] text-white outline-none focus:border-haul-500'

  return (
    <>
      <button
        title={t(locale, 'deleteButton.title')}
        onClick={() => setOpen(true)}
        className="shrink-0 text-[13px] text-white/35 transition-colors hover:text-bad-400"
      >
        ✕
      </button>
      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-ink-900 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[15px] font-semibold">{t(locale, 'deleteButton.heading')}</h3>
            <p className="mt-1 text-[12.5px] leading-relaxed text-white/60">
              «{title}» {note ?? t(locale, 'deleteButton.defaultNote')} {t(locale, 'deleteButton.body')}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <input
                autoFocus
                type="text"
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                value={word}
                onChange={(e) => setWord(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && word === DELETE_WORD && submit()}
                placeholder={DELETE_WORD}
                className={`${field} nums tracking-[0.2em]`}
              />
            </div>
            {err && <p className="mt-2 text-[12.5px] text-bad-400">{err}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                {t(locale, 'common.cancel')}
              </Button>
              <Button variant="danger" disabled={pending || word !== DELETE_WORD}
                onClick={submit}>
                {pending ? t(locale, 'common.deleting') : t(locale, 'common.delete')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
