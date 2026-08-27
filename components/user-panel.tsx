'use client'

// Меню аккаунта — то, что открывается по аватару.
//
// Было: три сетки круглых значков по четыре в ряд, четырнадцать штук, все одного
// веса, подписи в 11 пикселей и с обрезкой («Дата во…»). Это не меню аккаунта, а
// пульт запуска: глазу не за что зацепиться, потому что ничто не главнее другого,
// а половина плиток вела туда же, куда и навигация слева.
//
// Стало — как в почте, в GitHub, в Linear и вообще везде, где меню аккаунта работает:
//   1. Сверху — КТО ты: аватар, имя, почта, роль. Меню аккаунта начинается с
//      аккаунта, иначе непонятно, чьи это настройки (а вход бывает не свой).
//   2. Дальше — вертикальные СТРОКИ с текстом: строка читается за один взгляд,
//      значок в ней помогает, но не заменяет слово. Обрезать «Дата во…» больше
//      нечему: строке хватает ширины.
//   3. Переключатели показывают ТЕКУЩЕЕ значение справа. Плитка этого не умела:
//      чтобы узнать язык, надо было ткнуть и посмотреть, что стало.
//   4. Разделы навигации остались только на телефоне, где до них иначе не добраться
//      (в нижнюю панель влезает шесть вкладок). На десктопе рельс слева уже их
//      показывает, и дублировать его в меню — шум, а не удобство.
//   5. «Выйти» — внизу, отдельно, красным. Разрушительное действие не стоит рядом
//      с безобидным.

import { Button } from '@/components/button'
import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Check,
  ChevronRight,
  DollarSign,
  Globe,
  History,
  KeyRound,
  LifeBuoy,
  LogOut,
  PackagePlus,
  Palette,
  RotateCw,
  Send,
  ShieldCheck,
  Truck as TruckIcon,
  Users,
} from 'lucide-react'
import { LOCALES, type Locale } from '@/lib/i18n'
import { changeMyPassword, setRecoveryBirthday } from '@/app/account/actions'
import { signOut } from '@/app/login/actions'
import { notify } from '@/lib/notify'
import type { CurrentUser } from '@/lib/session'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
}

const ROW =
  'flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[13px] text-white/80 transition-colors hover:bg-white/8 hover:text-white'

/** Строка меню: значок, подпись, справа — значение, стрелка или переключатель. */
function Row({
  icon,
  label,
  right,
  href,
  onClick,
  onNavigate,
  danger = false,
}: {
  icon: React.ReactNode
  label: string
  right?: React.ReactNode
  href?: string
  onClick?: () => void
  onNavigate?: () => void
  danger?: boolean
}) {
  const cls = danger ? `${ROW} hover:bg-bad-500/10 hover:text-bad-400` : ROW
  const body = (
    <>
      <span className="shrink-0 text-white/45">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {right && <span className="shrink-0 text-[12px] text-white/45">{right}</span>}
    </>
  )
  if (href) {
    return (
      <Link href={href} onClick={onNavigate} className={cls}>
        {body}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  )
}

/** Строка, правый край которой занимает готовый переключатель (язык, тема, журнал). */
function ControlRow({ icon, label, control }: { icon: React.ReactNode; label: string; control: React.ReactNode }) {
  return (
    <div className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-[13px] text-white/80">
      <span className="shrink-0 text-white/45">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="shrink-0">{control}</span>
    </div>
  )
}

function Group({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-white/8 py-1 first:border-t-0">
      {title && (
        <p className="px-2 pb-1 pt-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-white/35">
          {title}
        </p>
      )}
      {children}
    </div>
  )
}

export function UserPanel({
  user,
  dockCollapsed = false,
  onExpandDock,
  showTelegram = false,
  showFinances = false,
  localeControl,
  themeControl,
  journalControl,
}: {
  user: CurrentUser
  /** Same capability flags the nav uses to hide dead tabs. A row pointing at a screen
   * this user is not allowed to open would be a promise the app then breaks. */
  showTelegram?: boolean
  showFinances?: boolean
  /** Whether the sibling icons (locale/notifications/journal/theme) are currently
   * tucked away (components/nav.tsx). When they are, the FIRST tap on the avatar
   * just brings them back instead of opening the profile popover. */
  dockCollapsed?: boolean
  onExpandDock?: () => void
  /** Переключатели живут в своих компонентах и встают в правый край своей строки —
   * туда, где у нормального меню стоит текущее значение. */
  localeControl?: React.ReactNode
  themeControl?: React.ReactNode
  journalControl?: React.ReactNode
}) {
  const router = useRouter()
  const locale = useLocale()
  const [open, setOpen] = useState(false)
  const [pwOpen, setPwOpen] = useState(false)
  const [pw, setPw] = useState('')
  const [bdayOpen, setBdayOpen] = useState(false)
  // Список языков раскрывается ВНУТРИ меню, а не всплывает над ним: у панели
  // меню есть overflow, и любой absolute-слой внутри неё просто срезается — именно
  // поэтому выбор языка «не открывался», хотя открывался.
  const [langOpen, setLangOpen] = useState(false)
  const [bday, setBday] = useState('')
  const [pending, start] = useTransition()
  const panelRef = useRef<HTMLDivElement>(null)

  // Escape, или щелчок мимо, закрывает меню — как любой попап в приложении: оно не
  // должно уметь запереть пользователя без выхода.
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function onAvatarClick() {
    // Правило «первое касание только достаёт значки» — только для ТЕЛЕФОННОЙ панели:
    // на десктопе ничего не прячется, а флаг оставался поднятым и съедал первый
    // щелчок по аватару. Поэтому та же граница, что и в CSS.
    const phone = typeof window !== 'undefined' && window.matchMedia('(max-width: 767.98px)').matches
    if (phone && dockCollapsed && onExpandDock) {
      onExpandDock()
      return
    }
    setOpen((v) => !v)
  }

  function chooseLocale(next: Locale) {
    setLangOpen(false)
    if (next === locale) return
    document.cookie = `locale=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
    // Мягкое обновление: серверные компоненты перечитают куку и отрисуются заново,
    // а прокрутка, открытые секции и введённое в формах останутся на месте.
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

  function logout() {
    start(async () => {
      await signOut()
      router.refresh()
    })
  }

  const current = LOCALES.find((l) => l.code === locale) ?? LOCALES[0]!
  const close = () => setOpen(false)

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={onAvatarClick}
        title={user.name}
        aria-label={user.name}
        aria-expanded={open}
        data-tour="avatar"
        className="nav-avatar-btn flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-haul-500 to-good-500 text-[12px] font-semibold text-white"
      >
        {initialsOf(user.name)}
      </button>

      {open && (
        // Позиционируется от ЭКРАНА, а не от аватара: аватар стоит посреди рельса,
        // и панель шириной 18rem вылезала бы то за левый край, то за правый.
        <div className="user-menu fixed inset-x-3 bottom-24 z-[55] mx-auto max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-ink-900 shadow-2xl md:bottom-16 md:left-3 md:right-auto md:mx-0 md:w-[18rem] md:max-w-none">
          {/* 1. Кто ты. Меню аккаунта начинается с аккаунта. */}
          <div className="flex items-center gap-3 border-b border-white/8 px-3 py-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-haul-500 to-good-500 text-[13px] font-semibold text-white">
              {initialsOf(user.name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold">{user.name}</span>
              <span className="block truncate text-[11.5px] text-white/45">{user.email}</span>
            </span>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-medium ${
                user.role === 'admin' ? 'bg-haul-500/20 text-haul-300' : 'bg-white/8 text-white/60'
              }`}
            >
              {t(locale, user.role === 'admin' ? 'userPanel.roleAdmin' : 'userPanel.roleDispatcher')}
            </span>
          </div>

          <div className="max-h-[70vh] overflow-y-auto px-1.5 py-1">
            {/* 2. Создать — две вещи, которые заводят каждый день. */}
            <Group>
              <Row
                icon={<PackagePlus size={15} />}
                label={t(locale, 'userPanel.tileNewLoad')}
                href="/loads/new"
                onNavigate={close}
              />
              <Row
                icon={<TruckIcon size={15} />}
                label={t(locale, 'userPanel.tileNewTruck')}
                href="/trucks/new"
                onNavigate={close}
              />
            </Group>

            {/* 3. Разделы — ТОЛЬКО на телефоне: в нижнюю панель влезает шесть вкладок,
                «Брокеры» и «Финансы» в неё не попадают, и это их единственный вход.
                На десктопе они есть в рельсе слева, и повторять их здесь незачем. */}
            <div className="md:hidden">
              <Group title={t(locale, 'userPanel.sectionsGroup')}>
                <Row
                  icon={<ShieldCheck size={15} />}
                  label={t(locale, 'userPanel.tileBrokers')}
                  href="/brokers"
                  onNavigate={close}
                />
                {showFinances && (
                  <Row
                    icon={<DollarSign size={15} />}
                    label={t(locale, 'userPanel.tileFinances')}
                    href="/invoices"
                    onNavigate={close}
                  />
                )}
                {showTelegram && (
                  <Row
                    icon={<Send size={15} />}
                    label={t(locale, 'userPanel.tileTelegram')}
                    href="/telegram"
                    onNavigate={close}
                  />
                )}
              </Group>
            </div>

            {/* 4. Настройки. У переключателей значение видно справа, не нажимая. */}
            <Group title={t(locale, 'userPanel.quickSettings')}>
              {/* Язык — обычная строка меню: справа текущий язык, по нажатию
                  разворачивается список. Ничего не всплывает, поэтому нечему и
                  срезаться. */}
              <Row
                icon={<Globe size={15} />}
                label={t(locale, 'userPanel.tileLang')}
                right={
                  <span className="flex items-center gap-1">
                    <span className="font-semibold text-white/70">{current.short}</span>
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
                      className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-white/8 ${
                        l.code === locale ? 'text-haul-300' : 'text-white/75'
                      }`}
                    >
                      <span className="w-7 shrink-0 text-[10.5px] font-bold uppercase text-white/40">{l.short}</span>
                      <span className="min-w-0 flex-1 truncate">{l.native}</span>
                      {l.code === locale && <Check size={14} className="shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
              {themeControl && (
                <ControlRow
                  icon={<Palette size={15} />}
                  label={t(locale, 'userPanel.tileTheme')}
                  control={themeControl}
                />
              )}
              <Row
                icon={<KeyRound size={15} />}
                label={t(locale, 'userPanel.tilePassword')}
                right={
                  <ChevronRight size={14} className={`transition-transform ${pwOpen ? 'rotate-90' : ''}`} />
                }
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
                    className="w-full rounded-lg border border-white/8 bg-ink-950/80 px-2.5 py-1.5 text-[13px] text-white outline-none focus:border-haul-500"
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    block
                    className="mt-2"
                    loading={pending}
                    disabled={pending || pw.length < 8}
                    onClick={savePassword}
                  >
                    {pending ? t(locale, 'common.saving') : t(locale, 'common.save')}
                  </Button>
                </div>
              )}
              {/* Дата рождения для «Забыли пароль?» — единственный путь назад, если
                  пароль забыт, а ты единственный админ. Хранится хешем. */}
              <Row
                icon={<LifeBuoy size={15} />}
                label={t(locale, 'userPanel.tileRecovery')}
                right={
                  <ChevronRight size={14} className={`transition-transform ${bdayOpen ? 'rotate-90' : ''}`} />
                }
                onClick={() => setBdayOpen((v) => !v)}
              />
              {bdayOpen && (
                <div className="px-2 pb-2">
                  <p className="mb-1.5 text-[11px] leading-relaxed text-white/50">
                    {t(locale, 'userPanel.recoveryHint')}
                  </p>
                  <input
                    type="date"
                    value={bday}
                    onChange={(e) => setBday(e.target.value)}
                    className="w-full rounded-lg border border-white/8 bg-ink-950/80 px-2.5 py-1.5 text-[13px] text-white outline-none focus:border-haul-500"
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    block
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
            </Group>

            {/* 5. Админ — одной строкой. «Люди», «Ключи» и «Импорт» были тремя
                плитками, а вели все на одну страницу: три входа в одну дверь. */}
            {user.role === 'admin' && (
              <Group title={t(locale, 'userPanel.adminSection')}>
                <Row
                  icon={<Users size={15} />}
                  label={t(locale, 'userPanel.tileAdminPanel')}
                  right={<ChevronRight size={14} />}
                  href="/admin"
                  onNavigate={close}
                />
                {journalControl && (
                  <ControlRow
                    icon={<History size={15} />}
                    label={t(locale, 'userPanel.tileJournal')}
                    control={journalControl}
                  />
                )}
              </Group>
            )}

            <Group>
              {/* Не ссылка, а механизм: перерисовать текущую страницу свежими
                  данными, не уходя с неё. Иначе остаётся только F5. */}
              <Row
                icon={<RotateCw size={15} />}
                label={t(locale, 'userPanel.tileRefresh')}
                onClick={() => {
                  router.refresh()
                  close()
                }}
              />
              <Row
                icon={<LogOut size={15} />}
                label={pending ? '…' : t(locale, 'userPanel.logout')}
                onClick={logout}
                danger
              />
            </Group>
          </div>
        </div>
      )}
    </div>
  )
}
