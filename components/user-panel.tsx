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
//
// 11/07/26: настройки (номер, язык, пароль, плитки, уведомления, отчёт) переехали в
// «Настройки» — один пункт внизу меню (components/profile-settings.tsx, /admin).
// Здесь осталось то, что и есть меню аккаунта: кто ты, что завести, настройки одной
// строкой, обновить, выйти.

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight, LogOut, PackagePlus, RotateCw, Settings, Truck as TruckIcon } from 'lucide-react'
import { signOut } from '@/app/login/actions'
import type { CurrentUser } from '@/lib/session'
import { useLocale } from '@/components/locale-provider'
import { shortName } from '@/lib/fmt'
import { t } from '@/lib/i18n'

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
}

const ROW =
  'flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-base text-t1 transition-colors hover:bg-white/8 hover:text-white'

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
      <span className="shrink-0 text-t3">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {right && <span className="shrink-0 text-sm text-t3">{right}</span>}
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

function Group({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-white/8 py-1 first:border-t-0">
      {title && (
        <p className="px-2 pb-1 pt-1.5 text-base font-semibold text-t2">
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
}: {
  user: CurrentUser
  /** Whether the sibling icons (locale/notifications/journal/theme) are currently
   * tucked away (components/nav.tsx). When they are, the FIRST tap on the avatar
   * just brings them back instead of opening the profile popover. */
  dockCollapsed?: boolean
  onExpandDock?: () => void
}) {
  const router = useRouter()
  const locale = useLocale()
  const [open, setOpen] = useState(false)
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
    // Один тап — меню. Раньше первое касание на телефоне лишь «доставало значки»
    // (язык, журнал, тему), и меню открывалось только со второго — никто не понимал.
    // Значков в ряду больше нет, доставать нечего.
    onExpandDock?.()
    setOpen((v) => !v)
  }

  function logout() {
    start(async () => {
      await signOut()
      router.refresh()
    })
  }

  const close = () => setOpen(false)

  return (
    // На телефоне аватар — крайний справа в верхней панели, как принято.
    <div className="relative max-md:order-last" ref={panelRef}>
      <button
        onClick={onAvatarClick}
        title={user.name}
        aria-label={user.name}
        aria-expanded={open}
        data-tour="avatar"
        className="nav-avatar-btn flex h-9 max-w-[11rem] shrink-0 items-center justify-center rounded-full px-3.5 text-t1"
      >
        {/* Просто «Alex C.» — имя и первая буква фамилии. Без кружка с инициалами:
            имя само говорит, кто вошёл. В свёрнутом рельсе остаются инициалы. */}
        <span className="nav-avatar-name min-w-0 truncate text-base font-medium">{shortName(user.name)}</span>
        <span className="nav-avatar-initials hidden text-sm font-semibold">{initialsOf(user.name)}</span>
      </button>

      {open && (
        // Позиционируется от ЭКРАНА, а не от аватара: аватар стоит посреди рельса,
        // и панель шириной 18rem вылезала бы то за левый край, то за правый.
        <div className="user-menu fixed inset-x-3 top-14 z-[55] mx-auto max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-ink-900 shadow-2xl md:bottom-16 md:left-3 md:right-auto md:top-auto md:mx-0 md:w-[18rem] md:max-w-none">
          {/* 1. Кто ты. Меню аккаунта начинается с аккаунта. */}
          <div className="flex items-center gap-3 border-b border-white/8 px-3 py-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-haul-400 to-haul-600 text-base font-semibold text-white">
              {initialsOf(user.name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-md font-semibold">{user.name}</span>
              <span className="block truncate text-xs text-t3">{user.email}</span>
            </span>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-2xs font-medium ${
                user.role === 'admin' ? 'bg-haul-500/20 text-haul-300' : 'bg-white/8 text-t2'
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

            <Group>
              <Row
                icon={<Settings size={15} />}
                label={t(locale, 'nav.settings')}
                right={<ChevronRight size={14} />}
                href="/admin"
                onNavigate={close}
              />
            </Group>

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
