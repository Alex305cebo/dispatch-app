'use client'

// Admin → Ключи. The whole reason this screen exists: the app is installed per company,
// so every install runs on ITS OWN third-party keys. Making the admin edit environment
// variables in a hosting panel would put a control a dispatcher needs behind a
// technical door — the same argument that already put the Telegram credentials in the
// UI rather than in .env.

import { useState, useTransition } from 'react'
import { Button } from '@/components/button'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'
import { saveKeys } from './actions'

function Field({
  label,
  hint,
  isSet,
  value,
  onChange,
  href,
}: {
  label: string
  hint: string
  isSet: boolean
  value: string
  onChange: (v: string) => void
  href: string
}) {
  const locale = useLocale()
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[13px] font-medium">{label}</span>
        <span
          className={`rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${
            isSet ? 'bg-good-500/15 text-good-400' : 'bg-warn-400/15 text-warn-400'
          }`}
        >
          {t(locale, isSet ? 'admin.keys.set' : 'admin.keys.notSet')}
        </span>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto text-[11.5px] text-haul-300 hover:underline"
        >
          {t(locale, 'admin.keys.where')}
        </a>
      </div>
      <input
        type="password"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t(locale, isSet ? 'admin.keys.replacePlaceholder' : 'admin.keys.newPlaceholder')}
        className="w-full rounded-lg border border-white/8 bg-ink-950/80 px-2.5 py-1.5 text-[13px] outline-none focus:border-haul-500"
      />
      <p className="mt-1 text-[11.5px] leading-snug text-white/45">{hint}</p>
    </div>
  )
}

export function KeysForm({
  status,
}: {
  status: { gemini: boolean; fmcsa: boolean; here: boolean; modelPref: 'saving' | 'quality' }
}) {
  const locale = useLocale()
  const [gemini, setGemini] = useState('')
  const [fmcsa, setFmcsa] = useState('')
  const [here, setHere] = useState('')
  const [pref, setPref] = useState(status.modelPref)
  const [pending, start] = useTransition()

  function save() {
    start(async () => {
      const res = await saveKeys({ gemini, fmcsa, here, modelPref: pref })
      if (res?.error) notify('error', res.error)
      else {
        notify('ok', t(locale, 'admin.keys.saved'))
        setGemini('')
        setFmcsa('')
        setHere('')
      }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <Field
        label={t(locale, 'admin.keys.gemini')}
        hint={t(locale, 'admin.keys.geminiHint')}
        isSet={status.gemini}
        value={gemini}
        onChange={setGemini}
        href="https://aistudio.google.com/apikey"
      />
      <Field
        label={t(locale, 'admin.keys.fmcsa')}
        hint={t(locale, 'admin.keys.fmcsaHint')}
        isSet={status.fmcsa}
        value={fmcsa}
        onChange={setFmcsa}
        href="https://mobile.fmcsa.dot.gov/QCDevsite/"
      />
      <Field
        label={t(locale, 'admin.keys.here')}
        hint={t(locale, 'admin.keys.hereHint')}
        isSet={status.here}
        value={here}
        onChange={setHere}
        href="https://platform.here.com/admin/apps"
      />

      {/* Only meaningful once the key has billing behind it — said plainly in the hint
          rather than hidden, so nobody switches it and then wonders why parsing dies
          after twenty documents. */}
      <div>
        <p className="mb-1 text-[13px] font-medium">{t(locale, 'admin.keys.modelPref')}</p>
        <div className="flex gap-1.5">
          {(['saving', 'quality'] as const).map((p) => (
            <Button
              key={p}
              size="sm"
              variant={pref === p ? 'primary' : 'secondary'}
              onClick={() => setPref(p)}
            >
              {t(locale, p === 'saving' ? 'admin.keys.modelSaving' : 'admin.keys.modelQuality')}
            </Button>
          ))}
        </div>
        <p className="mt-1 text-[11.5px] leading-snug text-white/45">
          {t(locale, pref === 'saving' ? 'admin.keys.modelSavingHint' : 'admin.keys.modelQualityHint')}
        </p>
      </div>

      <Button variant="primary" size="sm" loading={pending} disabled={pending} onClick={save} className="self-start">
        {pending ? t(locale, 'common.saving') : t(locale, 'common.save')}
      </Button>
    </div>
  )
}
