'use client'

import { Button } from '@/components/button'
// One-time Telegram connect: api_id/api_hash → phone → code → [2FA password].
// The OWNER types every credential; nothing is prefilled or stored client-side.

import { useState, useTransition } from 'react'
import { tgConfirmLogin, tgStartLogin } from './actions'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

const input =
  'w-full rounded-xl border border-white/8 bg-ink-900/80 px-3 py-2.5 text-[15px] text-white outline-none transition-all placeholder:text-white/45 focus:border-haul-500 focus:ring-4 focus:ring-haul-500/15'

export function TgSetup() {
  const locale = useLocale()
  const [pending, start] = useTransition()
  const [step, setStep] = useState<'creds' | 'code' | '2fa'>('creds')
  const [apiId, setApiId] = useState('')
  const [apiHash, setApiHash] = useState('')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [token, setToken] = useState('')
  const [deliveryHint, setDeliveryHint] = useState('')
  const [error, setError] = useState<string | null>(null)

  const sendCode = () =>
    start(async () => {
      setError(null)
      const res = await tgStartLogin(apiId, apiHash, phone)
      if ('error' in res) setError(res.error)
      else {
        setToken(res.token)
        setDeliveryHint(res.deliveryHint)
        setStep('code')
        notify('ok', t(locale, 'telegram.setup.codeRequested'))
      }
    })

  const confirm = () =>
    start(async () => {
      setError(null)
      const res = await tgConfirmLogin(token, code, password || undefined)
      if ('error' in res) setError(res.error)
      else if ('need2fa' in res) setStep('2fa')
      else {
        notify('ok', t(locale, 'telegram.setup.connected'))
      }
    })

  return (
    <div className="panel mx-auto max-w-sm p-4">
      <h2 className="text-[14px] font-semibold">{t(locale, 'telegram.setup.title')}</h2>
      <p className="mt-1 text-[12px] leading-snug text-white/60">
        {t(locale, 'telegram.setup.introPre')} <b>{t(locale, 'telegram.setup.introBold')}</b> {t(locale, 'telegram.setup.introPost')}
      </p>

      {step === 'creds' && (
        <div className="mt-3 flex flex-col gap-2">
          {/* Пошагово и с успокоением: страница входа Telegram называется
              «Delete Account or Manage Apps», и люди боялись, что вход удалит
              аккаунт. Инструкция говорит прямо: не удалит, удаление — отдельная
              кнопка, которую никто не трогает. */}
          <details className="group rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2" open>
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[12px] font-medium text-white/75">
              <span className="text-[11px] text-white/40 transition-transform group-open:rotate-90">▸</span>
              {t(locale, 'telegram.setup.guideTitle')}
            </summary>
            <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-4 text-[11.5px] leading-snug text-white/60">
              <li>
                <a
                  href="https://my.telegram.org"
                  target="_blank"
                  rel="noreferrer"
                  className="text-haul-400 hover:underline"
                >
                  my.telegram.org
                </a>{' '}
                — {t(locale, 'telegram.setup.step1')}
              </li>
              <li className="text-warn-400/90">{t(locale, 'telegram.setup.step2')}</li>
              <li>{t(locale, 'telegram.setup.step3')}</li>
              <li>{t(locale, 'telegram.setup.step4')}</li>
              <li>{t(locale, 'telegram.setup.step5')}</li>
            </ol>
            <p className="mt-2 rounded-lg border border-warn-400/25 bg-warn-400/[0.06] px-2.5 py-1.5 text-[11px] leading-snug text-warn-400">
              🔒 {t(locale, 'telegram.setup.safeNote')}
            </p>
          </details>
          <div className="grid grid-cols-2 gap-2">
            <input value={apiId} onChange={(e) => setApiId(e.target.value)} placeholder="api_id" className={input} inputMode="numeric" />
            <input value={apiHash} onChange={(e) => setApiHash(e.target.value)} placeholder="api_hash" className={input} />
          </div>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t(locale, 'telegram.setup.phonePlaceholder')} className={input} inputMode="tel" />
          <Button variant="primary" className="mt-1" disabled={pending || !apiId || !apiHash || !phone}
            onClick={sendCode}>
            {pending ? t(locale, 'telegram.setup.sendingCode') : t(locale, 'telegram.setup.getCode')}
          </Button>
        </div>
      )}

      {step === 'code' && (
        <div className="mt-3 flex flex-col gap-2">
          {deliveryHint && (
            <p className="rounded-lg border border-haul-500/25 bg-haul-500/[0.07] px-2.5 py-1.5 text-[11.5px] leading-snug text-haul-300">
              {deliveryHint}
            </p>
          )}
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t(locale, 'telegram.setup.codePlaceholder')} className={input} inputMode="numeric" autoFocus />
          <Button variant="primary" disabled={pending || !code}
            onClick={confirm}>
            {pending ? t(locale, 'telegram.setup.checking') : t(locale, 'telegram.setup.logIn')}
          </Button>
        </div>
      )}

      {step === '2fa' && (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-[12px] text-white/60">{t(locale, 'telegram.setup.twoFaText')}</p>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t(locale, 'telegram.setup.cloudPasswordPlaceholder')} className={input} autoFocus />
          <Button variant="primary" disabled={pending || !password}
            onClick={confirm}>
            {pending ? t(locale, 'telegram.setup.checking') : t(locale, 'telegram.setup.confirm')}
          </Button>
        </div>
      )}

      {error && <p className="mt-2 text-[12px] text-bad-400">{error}</p>}

      <p className="mt-3 text-[10.5px] leading-snug text-white/40">
        {t(locale, 'telegram.setup.footer')}
      </p>
    </div>
  )
}
