'use client'

// Админка → «Отчёт на почту»: кому, с какого Gmail, пароль приложения и кнопка
// «Отправить сейчас». По воскресеньям то же письмо шлёт расписание GitHub
// (.github/workflows/weekly-report.yml), здесь — проверить и настроить.

import { useState, useTransition } from 'react'
import { Eye, Send } from 'lucide-react'
import { Button } from '@/components/button'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'
import { usDate } from '@/lib/fmt'
import { saveReportSettings, sendReportNow } from './actions'

type LastSend = { week: string; at: string; ok: boolean; to: number; files: number; error?: string }

const input =
  'w-full rounded-lg border border-white/8 bg-ink-950/80 px-2.5 py-1.5 text-base outline-none focus:border-haul-500'

export function ReportForm({ status }: { status: { to: string; user: string; passSet: boolean; last: LastSend | null } }) {
  const locale = useLocale()
  const [to, setTo] = useState(status.to)
  const [user, setUser] = useState(status.user)
  const [pass, setPass] = useState('')
  const [saving, startSave] = useTransition()
  const [sending, startSend] = useTransition()
  // Итог отправки — рядом с кнопкой: его читают, сверяясь с почтой.
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  function save(after?: () => void) {
    startSave(async () => {
      const res = await saveReportSettings({ to, user, pass })
      if (res?.error) notify('error', res.error)
      else {
        setPass('')
        if (after) after()
        else notify('ok', t(locale, 'admin.keys.saved'))
      }
    })
  }

  function send() {
    setResult(null)
    // Сначала сохраняем набранное — иначе «Отправить» ушло бы со старыми адресами.
    save(() =>
      startSend(async () => {
        const res = await sendReportNow()
        setResult(
          'error' in res
            ? { ok: false, text: res.error }
            : { ok: true, text: t(locale, 'admin.report.sent').replace('{to}', String(res.to)).replace('{files}', String(res.files)) },
        )
      }),
    )
  }

  const last = status.last
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-1 text-base font-medium">{t(locale, 'admin.report.to')}</p>
        <input className={input} value={to} onChange={(e) => setTo(e.target.value)} autoComplete="off" />
        <p className="mt-1 text-xs leading-snug text-t3">{t(locale, 'admin.report.toHint')}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-base font-medium">{t(locale, 'admin.report.user')}</p>
          <input className={input} type="email" value={user} onChange={(e) => setUser(e.target.value)} placeholder="name@gmail.com" autoComplete="off" />
        </div>
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="text-base font-medium">{t(locale, 'admin.report.pass')}</span>
            {/* Пароль не обязателен (без него шлёт сервер сайта) — «не задан» жёлтым не пугаем. */}
            {status.passSet && <span className="rounded bg-good-500/15 px-1.5 py-0.5 text-2xs font-semibold text-good-400">{t(locale, 'admin.keys.set')}</span>}
            <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" className="ml-auto text-xs text-haul-300 hover:underline">
              {t(locale, 'admin.keys.where')}
            </a>
          </div>
          <input
            className={input}
            type="password"
            autoComplete="off"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder={t(locale, status.passSet ? 'admin.keys.replacePlaceholder' : 'admin.keys.newPlaceholder')}
          />
          <p className="mt-1 text-xs leading-snug text-t3">{t(locale, 'admin.report.passHint')}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={saving || sending} onClick={() => save()}>
          {t(locale, 'admin.report.save')}
        </Button>
        <Button size="sm" variant="secondary" disabled={saving || sending} onClick={send} icon={<Send size={14} aria-hidden />}>
          {sending ? t(locale, 'admin.report.sending') : t(locale, 'admin.report.send')}
        </Button>
        <Button size="sm" variant="secondary" href="/admin/report" external target="_blank" icon={<Eye size={14} aria-hidden />}>
          {t(locale, 'admin.report.preview')}
        </Button>
        {result && <span className={`text-sm ${result.ok ? 'text-good-400' : 'text-bad-400'}`}>{result.text}</span>}
      </div>
      <p className="text-xs text-t3">
        {t(locale, 'admin.report.last')}:{' '}
        {last ? (
          <span className={last.ok ? 'text-good-400' : 'text-bad-400'}>
            {usDate(last.at.slice(0, 10))} · {t(locale, 'admin.report.week').replace('{date}', usDate(last.week))} ·{' '}
            {last.ok ? t(locale, 'admin.report.sent').replace('{to}', String(last.to)).replace('{files}', String(last.files)) : last.error}
          </span>
        ) : (
          t(locale, 'admin.report.never')
        )}
      </p>
    </div>
  )
}
