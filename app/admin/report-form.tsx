'use client'

// Админка → «Отчёт на почту»: кому слать (добавить / убрать адрес), включено ли
// расписание, в какой день и час по ET, кнопки «Отправить сейчас» и «Посмотреть письмо»,
// история отправок. Владелец, 10/22/26: «чтобы можно было контролировать этот процесс».
// Само расписание — lib/weekly-report.ts (maybeSendWeeklyReport).

import { useState, useTransition, type KeyboardEvent } from 'react'
import { Eye, Plus, Send, X } from 'lucide-react'
import { Button } from '@/components/button'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t, type Locale } from '@/lib/i18n'
import { usDate } from '@/lib/fmt'
import { saveReportSettings, sendReportNow } from './actions'

type LastSend = { week: string; at: string; ok: boolean; to: number; files: number; error?: string; manual?: boolean }
type Status = {
  to: string
  user: string
  passSet: boolean
  log: LastSend[]
  enabled: boolean
  day: number
  hour: number
}

const input =
  'w-full rounded-lg border border-white/8 bg-ink-950/80 px-2.5 py-1.5 text-base outline-none focus:border-haul-500'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Пн … Вс по порядку, значения — getUTCDay (Вс=0).
const DAYS = [1, 2, 3, 4, 5, 6, 0]

const splitEmails = (raw: string) =>
  raw
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)

/** Короткое имя дня на языке интерфейса: 2026-10-18 — воскресенье. */
function dayName(locale: Locale, day: number): string {
  const d = new Date(Date.UTC(2026, 9, 18 + day, 12))
  return new Intl.DateTimeFormat(locale === 'kk' ? 'kk-KZ' : locale, { weekday: 'short', timeZone: 'UTC' }).format(d)
}

/** Момент отправки по ET: «10/22/26 21:05». */
const whenEt = (iso: string) => {
  const d = new Date(iso)
  const day = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: '2-digit', day: '2-digit', year: '2-digit' }).format(d)
  const time = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d)
  return `${day} ${time}`
}

export function ReportForm({ status }: { status: Status }) {
  const locale = useLocale()
  const [emails, setEmails] = useState<string[]>(() => splitEmails(status.to))
  const [draft, setDraft] = useState('')
  const [enabled, setEnabled] = useState(status.enabled)
  const [day, setDay] = useState(status.day)
  const [hour, setHour] = useState(status.hour)
  const [user, setUser] = useState(status.user)
  const [pass, setPass] = useState('')
  const [saving, startSave] = useTransition()
  const [sending, startSend] = useTransition()
  // Итог отправки — рядом с кнопкой: его читают, сверяясь с почтой.
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  /** Добавить набранное; вернуть итоговый список (для «Сохранить» сразу после ввода). */
  function addDraft(): string[] | null {
    const fresh = splitEmails(draft)
    if (!fresh.length) return emails
    const bad = fresh.find((e) => !EMAIL_RE.test(e))
    if (bad) {
      notify('error', `${t(locale, 'admin.report.badEmail')}: ${bad}`)
      return null
    }
    const next = [...emails, ...fresh.filter((e) => !emails.includes(e))]
    setEmails(next)
    setDraft('')
    return next
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addDraft()
    }
  }

  function save(after?: () => void) {
    const list = addDraft()
    if (!list) return
    if (!list.length) {
      notify('error', t(locale, 'admin.report.toHint'))
      return
    }
    startSave(async () => {
      const res = await saveReportSettings({ to: list.join(', '), user, pass, enabled, day, hour })
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

  return (
    <div className="flex flex-col gap-5">
      {/* Кому — адреса плашками: убрать крестиком, добавить полем справа. */}
      <div>
        <p className="mb-1.5 text-base font-medium">{t(locale, 'admin.report.to')}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {emails.map((e) => (
            <span key={e} className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] py-1 pr-1 pl-3 text-sm text-t1">
              {e}
              <button
                type="button"
                onClick={() => setEmails(emails.filter((x) => x !== e))}
                aria-label={`${t(locale, 'admin.report.remove')} ${e}`}
                className="grid size-5 place-items-center rounded-full text-t3 hover:bg-bad-500/15 hover:text-bad-400"
              >
                <X size={12} aria-hidden />
              </button>
            </span>
          ))}
          <span className="inline-flex min-w-[220px] flex-1 items-center gap-1.5">
            <input
              className={input}
              type="email"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKey}
              placeholder={t(locale, 'admin.report.addPlaceholder')}
              autoComplete="off"
            />
            <Button size="sm" variant="secondary" onClick={() => addDraft()} icon={<Plus size={14} aria-hidden />}>
              {t(locale, 'admin.report.add')}
            </Button>
          </span>
        </div>
        <p className="mt-1 text-xs leading-snug text-t3">{t(locale, 'admin.report.toHint')}</p>
      </div>

      {/* Когда — включено ли, день недели кнопками, час по ET. */}
      <div>
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <span className="text-base font-medium">{t(locale, 'admin.report.schedule')}</span>
          <div className="flex gap-1">
            <Button size="sm" variant={enabled ? 'primary' : 'secondary'} onClick={() => setEnabled(true)}>
              {t(locale, 'admin.report.on')}
            </Button>
            <Button size="sm" variant={!enabled ? 'primary' : 'secondary'} onClick={() => setEnabled(false)}>
              {t(locale, 'admin.report.off')}
            </Button>
          </div>
        </div>
        <div className={`flex flex-wrap items-center gap-1.5 ${enabled ? '' : 'pointer-events-none opacity-40'}`}>
          {DAYS.map((d) => (
            <Button key={d} size="sm" variant={day === d ? 'primary' : 'secondary'} onClick={() => setDay(d)} className="min-w-11 capitalize">
              {dayName(locale, d)}
            </Button>
          ))}
          <select
            value={hour}
            onChange={(e) => setHour(Number(e.target.value))}
            className="rounded-lg border border-white/8 bg-ink-950/80 px-2 py-1.5 text-base outline-none focus:border-haul-500"
            aria-label={t(locale, 'admin.report.hour')}
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, '0')}:00 ET
              </option>
            ))}
          </select>
        </div>
        <p className="mt-1 text-xs leading-snug text-t3">{t(locale, enabled ? 'admin.report.scheduleHint' : 'admin.report.offHint')}</p>
      </div>

      {/* Gmail — запасной путь, свёрнут: без него шлёт сервер сайта. */}
      <details className="rounded-lg border border-white/6 px-3 py-2">
        <summary className="cursor-pointer text-sm text-t2">
          {t(locale, 'admin.report.gmail')}
          {status.passSet && <span className="ml-2 rounded bg-good-500/15 px-1.5 py-0.5 text-2xs font-semibold text-good-400">{t(locale, 'admin.keys.set')}</span>}
        </summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-sm font-medium">{t(locale, 'admin.report.user')}</p>
            <input className={input} type="email" value={user} onChange={(e) => setUser(e.target.value)} placeholder="name@gmail.com" autoComplete="off" />
          </div>
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="text-sm font-medium">{t(locale, 'admin.report.pass')}</span>
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
      </details>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="primary" disabled={saving || sending} onClick={() => save()}>
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

      {/* История — последние отправки, новые сверху. */}
      <div>
        <p className="mb-1.5 text-base font-medium">{t(locale, 'admin.report.history')}</p>
        {status.log.length === 0 ? (
          <p className="text-sm text-t3">{t(locale, 'admin.report.never')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {status.log.map((e, i) => (
                  <tr key={`${e.at}-${i}`} className="border-t border-white/6 first:border-t-0">
                    <td className="py-1.5 pr-3 whitespace-nowrap text-t2 nums">{whenEt(e.at)}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap text-t3">{t(locale, 'admin.report.week').replace('{date}', usDate(e.week))}</td>
                    <td className={`py-1.5 pr-3 ${e.ok ? 'text-good-400' : 'text-bad-400'}`}>
                      {e.ok ? `✓ ${t(locale, 'admin.report.sent').replace('{to}', String(e.to)).replace('{files}', String(e.files))}` : `✕ ${e.error ?? ''}`}
                    </td>
                    <td className="py-1.5 whitespace-nowrap text-t3">{t(locale, e.manual ? 'admin.report.manual' : 'admin.report.auto')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
