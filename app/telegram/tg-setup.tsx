'use client'

// One-time Telegram connect: api_id/api_hash → phone → code → [2FA password].
// The OWNER types every credential; nothing is prefilled or stored client-side.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { tgConfirmLogin, tgStartLogin } from './actions'
import { notify } from '@/lib/notify'

const input =
  'w-full rounded-xl border border-white/8 bg-ink-900/80 px-3 py-2.5 text-[15px] text-white outline-none transition-all placeholder:text-white/45 focus:border-haul-500 focus:ring-4 focus:ring-haul-500/15'

export function TgSetup() {
  const router = useRouter()
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
        notify('ok', 'Код запрошен')
      }
    })

  const confirm = () =>
    start(async () => {
      setError(null)
      const res = await tgConfirmLogin(token, code, password || undefined)
      if ('error' in res) setError(res.error)
      else if ('need2fa' in res) setStep('2fa')
      else {
        notify('ok', 'Telegram подключён')
        router.refresh()
      }
    })

  return (
    <div className="panel mx-auto max-w-sm p-4">
      <h2 className="text-[14px] font-semibold">Подключение Telegram</h2>
      <p className="mt-1 text-[12px] leading-snug text-white/60">
        Подключается <b>твой</b> аккаунт — водители ничего не устанавливают и не нажимают.
      </p>

      {step === 'creds' && (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-[11px] leading-snug text-white/50">
            api_id/api_hash —{' '}
            <a
              href="https://my.telegram.org"
              target="_blank"
              rel="noreferrer"
              className="text-haul-400 hover:underline"
            >
              my.telegram.org
            </a>{' '}
            → API development tools.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <input value={apiId} onChange={(e) => setApiId(e.target.value)} placeholder="api_id" className={input} inputMode="numeric" />
            <input value={apiHash} onChange={(e) => setApiHash(e.target.value)} placeholder="api_hash" className={input} />
          </div>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Телефон (+1...)" className={input} inputMode="tel" />
          <button
            disabled={pending || !apiId || !apiHash || !phone}
            onClick={sendCode}
            className="mt-1 rounded-xl bg-haul-500 py-2 text-[13px] font-semibold transition-colors hover:bg-haul-400 disabled:opacity-40"
          >
            {pending ? 'Отправляю код…' : 'Получить код в Telegram'}
          </button>
        </div>
      )}

      {step === 'code' && (
        <div className="mt-3 flex flex-col gap-2">
          {deliveryHint && (
            <p className="rounded-lg border border-haul-500/25 bg-haul-500/[0.07] px-2.5 py-1.5 text-[11.5px] leading-snug text-haul-300">
              {deliveryHint}
            </p>
          )}
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Код из Telegram" className={input} inputMode="numeric" autoFocus />
          <button
            disabled={pending || !code}
            onClick={confirm}
            className="rounded-xl bg-haul-500 py-2 text-[13px] font-semibold transition-colors hover:bg-haul-400 disabled:opacity-40"
          >
            {pending ? 'Проверяю…' : 'Войти'}
          </button>
        </div>
      )}

      {step === '2fa' && (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-[12px] text-white/60">Включён облачный пароль (2FA) — введи его:</p>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Облачный пароль" className={input} autoFocus />
          <button
            disabled={pending || !password}
            onClick={confirm}
            className="rounded-xl bg-haul-500 py-2 text-[13px] font-semibold transition-colors hover:bg-haul-400 disabled:opacity-40"
          >
            {pending ? 'Проверяю…' : 'Подтвердить'}
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-[12px] text-bad-400">{error}</p>}

      <p className="mt-3 text-[10.5px] leading-snug text-white/40">
        Вход — один раз, локально. Дальше сессия хранится на сервере и работает везде.
      </p>
    </div>
  )
}
