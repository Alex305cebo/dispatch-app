'use client'

// «Профиль» — первая секция «Настроек» (11/07/26), общая для всех, кто вошёл.
//
// Раньше всё это жило в меню аватара: свой номер и реквизиты для брокера, язык,
// перестановка плиток, уведомления браузера, пароль, дата для «Забыли пароль?». Меню
// аватара — для «кто я и выйти», а настройки — в «Настройках»: одной шестерёнкой
// внизу меню, как в любой TMS. Строки те же, что были в меню, — значок, подпись,
// справа текущее значение или стрелка, раскрытие на месте.

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Building2, Check, ChevronRight, Copy, Globe, KeyRound, LayoutGrid, LifeBuoy, Phone } from 'lucide-react'
import { Button } from '@/components/button'
import { AlertToggle } from '@/components/alert-watch'
import { companyBlock, copyText, useMyPhone } from '@/components/driver-directory'
import { useLocale } from '@/components/locale-provider'
import { changeMyPassword, setRecoveryBirthday, setTilesRearrange } from '@/app/account/actions'
import { LOCALES, type Locale } from '@/lib/i18n'
import { notify } from '@/lib/notify'
import { t } from '@/lib/i18n'

const ROW =
  'flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-base text-t1 transition-colors hover:bg-white/8 hover:text-white'

function Row({
  icon,
  label,
  right,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  right?: React.ReactNode
  onClick?: () => void
}) {
  return (
    <button type="button" onClick={onClick} className={ROW}>
      <span className="shrink-0 text-t3">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {right && <span className="shrink-0 text-sm text-t3">{right}</span>}
    </button>
  )
}

function TilesRow({ enabled, locale }: { enabled: boolean; locale: Locale }) {
  const [pending, start] = useTransition()
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await setTilesRearrange(!enabled)
            if (res?.error) notify('error', res.error)
            else notify('ok', t(locale, enabled ? 'grid.setting.turnedOff' : 'grid.setting.turnedOn'))
          })
        }
        className={`${ROW} disabled:opacity-40`}
      >
        <span className="shrink-0 text-t3">
          <LayoutGrid size={15} />
        </span>
        <span className="min-w-0 flex-1 truncate">{t(locale, 'grid.setting.label')}</span>
        <span className={`shrink-0 text-xs font-semibold ${enabled ? 'text-good-400' : 'text-t3'}`}>
          {t(locale, enabled ? 'grid.setting.on' : 'grid.setting.off')}
        </span>
      </button>
      <p className="px-2 pb-1 text-xs leading-relaxed text-t3">{t(locale, 'grid.setting.hint')}</p>
    </>
  )
}

const INPUT =
  'w-full rounded-lg border border-white/8 bg-ink-950/80 px-2.5 py-1.5 text-base text-white outline-none focus:border-haul-500'

export function ProfileSettings({
  admin,
  tilesEnabled,
  dispatcherPhone,
  company,
}: {
  admin: boolean
  tilesEnabled: boolean
  dispatcherPhone: string
  company: { mc: string; name: string; email: string } | null
}) {
  const router = useRouter()
  const locale = useLocale()
  const [langOpen, setLangOpen] = useState(false)
  const [pwOpen, setPwOpen] = useState(false)
  const [pw, setPw] = useState('')
  const [bdayOpen, setBdayOpen] = useState(false)
  const [bday, setBday] = useState('')
  const [phoneOpen, setPhoneOpen] = useState(false)
  const [phoneDraft, setPhoneDraft] = useState('')
  const my = useMyPhone(dispatcherPhone)
  const [pending, start] = useTransition()
  const current = LOCALES.find((l) => l.code === locale) ?? LOCALES[0]!

  function chooseLocale(next: Locale) {
    setLangOpen(false)
    if (next === locale) return
    document.cookie = `locale=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
    router.refresh()
  }

  function savePassword() {
    start(async () => {
      const res = await changeMyPassword(pw)
      if (res?.error) notify('error', res.error)
      else {
        notify('ok', t(locale, 'userPanel.passwordChanged'))
        setPw('')
        setPwOpen(false)
      }
    })
  }

  return (
    <div className="grid gap-x-6 md:grid-cols-2">
      {/* Слева — для брокера: свой номер и реквизиты компании (их кладёт в блок брокеру
          кнопка «Copy Driver Info» у каждого трака). */}
      <div>
        <p className="px-2 pb-1 pt-1.5 text-sm font-semibold text-t2">{t(locale, 'userPanel.brokerGroup')}</p>
        <Row
          icon={<Phone size={15} />}
          label={t(locale, 'drivers.myPhone')}
          right={
            <span className="flex items-center gap-1">
              <span className={my.phone ? 'nums font-semibold text-t2' : undefined}>{my.phone || t(locale, 'drivers.noPhone')}</span>
              <ChevronRight size={14} className={`transition-transform ${phoneOpen ? 'rotate-90' : ''}`} />
            </span>
          }
          onClick={() => {
            setPhoneDraft(my.phone)
            setPhoneOpen((v) => !v)
          }}
        />
        {phoneOpen && (
          <div className="flex items-center gap-1.5 px-2 pb-2">
            <input
              value={phoneDraft}
              autoFocus
              inputMode="tel"
              onChange={(e) => setPhoneDraft(e.target.value)}
              placeholder="786 461 4739"
              aria-label={t(locale, 'drivers.myPhone')}
              className={`nums min-w-0 flex-1 ${INPUT}`}
            />
            <Button
              variant="primary"
              size="sm"
              loading={my.pending}
              disabled={my.pending}
              onClick={() => my.save(phoneDraft, t(locale, 'drivers.phoneSaved'), () => setPhoneOpen(false))}
            >
              {t(locale, 'drivers.save')}
            </Button>
          </div>
        )}
        {company && (
          <button
            type="button"
            onClick={() =>
              copyText(companyBlock({ mc: company.mc, companyName: company.name, companyEmail: company.email }), t(locale, 'drivers.copied'))
            }
            title={t(locale, 'userPanel.companyCopy')}
            className={ROW}
          >
            <span className="shrink-0 text-t3">
              <Building2 size={15} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate">{t(locale, 'drivers.company')}</span>
              <span className="nums block truncate text-xs text-t3">
                MC {company.mc || '—'}
                {company.name && ` · ${company.name}`}
              </span>
            </span>
            <Copy size={14} className="shrink-0 text-haul-300/80" aria-hidden />
          </button>
        )}
        <Row
          icon={<Globe size={15} />}
          label={t(locale, 'userPanel.tileLang')}
          right={
            <span className="flex items-center gap-1">
              <span className="font-semibold text-t2">{current.short}</span>
              <ChevronRight size={14} className={`transition-transform ${langOpen ? 'rotate-90' : ''}`} />
            </span>
          }
          onClick={() => setLangOpen((v) => !v)}
        />
        {langOpen && (
          <div className="mb-1 ml-2 flex flex-col border-l border-white/10 pl-2">
            {LOCALES.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => chooseLocale(l.code)}
                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-base transition-colors hover:bg-white/8 ${
                  l.code === locale ? 'text-haul-300' : 'text-t2'
                }`}
              >
                <span className="w-7 shrink-0 text-2xs font-bold uppercase text-t3">{l.short}</span>
                <span className="min-w-0 flex-1 truncate">{l.native}</span>
                {l.code === locale && <Check size={14} className="shrink-0" />}
              </button>
            ))}
          </div>
        )}
        {admin && <TilesRow enabled={tilesEnabled} locale={locale} />}
        <AlertToggle />
      </div>

      {/* Справа — вход: пароль и дата для «Забыли пароль?» (хранится хешем). */}
      <div>
        <p className="px-2 pb-1 pt-1.5 text-sm font-semibold text-t2">{t(locale, 'admin.profileAccess')}</p>
        <Row
          icon={<KeyRound size={15} />}
          label={t(locale, 'userPanel.tilePassword')}
          right={<ChevronRight size={14} className={`transition-transform ${pwOpen ? 'rotate-90' : ''}`} />}
          onClick={() => setPwOpen((v) => !v)}
        />
        {pwOpen && (
          <div className="px-2 pb-2">
            <input
              type="password"
              value={pw}
              autoFocus
              onChange={(e) => setPw(e.target.value)}
              placeholder={t(locale, 'userPanel.newPasswordPlaceholder')}
              className={INPUT}
            />
            <Button variant="primary" size="sm" className="mt-2" loading={pending} disabled={pending || pw.length < 8} onClick={savePassword}>
              {pending ? t(locale, 'common.saving') : t(locale, 'common.save')}
            </Button>
          </div>
        )}
        <Row
          icon={<LifeBuoy size={15} />}
          label={t(locale, 'userPanel.tileRecovery')}
          right={<ChevronRight size={14} className={`transition-transform ${bdayOpen ? 'rotate-90' : ''}`} />}
          onClick={() => setBdayOpen((v) => !v)}
        />
        {bdayOpen && (
          <div className="px-2 pb-2">
            <p className="mb-1.5 text-xs leading-relaxed text-t3">{t(locale, 'userPanel.recoveryHint')}</p>
            <input type="date" value={bday} onChange={(e) => setBday(e.target.value)} className={INPUT} />
            <Button
              variant="primary"
              size="sm"
              className="mt-2"
              loading={pending}
              disabled={pending || !bday}
              onClick={() =>
                start(async () => {
                  const res = await setRecoveryBirthday(bday)
                  if (res?.error) notify('error', res.error)
                  else {
                    notify('ok', t(locale, 'userPanel.recoverySaved'))
                    setBdayOpen(false)
                  }
                })
              }
            >
              {t(locale, 'common.save')}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
