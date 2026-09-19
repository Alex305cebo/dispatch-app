import { after } from 'next/server'
import { ensureDocTitles } from '@/lib/doc-title'
import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Nav } from '@/components/nav'
import { getCompany } from '@/lib/invoice'
import { getCurrentUser } from '@/lib/session'
import { headers } from 'next/headers'
import { isProductHost, PRODUCT_NAME } from '@/lib/brand'
import { getLocale } from '@/lib/i18n-server'
import { LocaleProvider } from '@/components/locale-provider'
import { can } from '@/lib/capabilities-server'
import { fleetExpiryAlerts } from '@/lib/maintenance'
import { DemoModeBanner } from '@/components/demo-mode-banner'
import { Toaster } from '@/components/toaster'
import { Tour } from '@/components/tour'
import { tourSteps } from '@/lib/tour'
import { t } from '@/lib/i18n'
import { RevealGuard } from '@/components/reveal-guard'
import { BuildWatch } from '@/components/build-watch'
import { AlertWatch } from '@/components/alert-watch'
import './globals.css'

// Apply the saved theme before first paint — no flash of the wrong colours.
// Light is now the default surface (airy SaaS); dark is opt-in and only applied when
// the user explicitly chose it. Absence of a stored choice = light.
const THEME_INIT = `try{var t=localStorage.getItem('theme');document.documentElement.dataset.theme=(t==='dark'?'dark':'light')}catch(e){document.documentElement.dataset.theme='light'}`

// Self-hosted by next/font at build time: no request to Google at runtime, no layout
// shift while a webfont loads, and nothing for an ad blocker to break.
// Geist (19.09.2026, вместо Inter): у него шире плечи и спокойнее буквы на 11-13px,
// то есть ровно на наших размерах, и есть кириллица — без неё русский интерфейс
// свалился бы на системный шрифт. Цифры — Geist Mono, одной семьёй с текстом.
const sans = Geist({
  subsets: ['latin', 'cyrillic'], // dispatcher names and the RU locale are Cyrillic
  variable: '--font-geist',
  display: 'swap',
})

// Numbers only — rates, miles, truck numbers, invoice ids. A monospaced face makes
// figures line up column-to-column and, unlike the tabular-nums trick the `nums`
// utility already applies, keeps digit shapes distinct at 11px.
const mono = Geist_Mono({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-geist-mono',
  display: 'swap',
})

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  const name = (await onProductSite()) ? PRODUCT_NAME : 'Dispatch'
  return {
    title: name,
    description: t(locale, 'app.description'),
    applicationName: name,
    appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: name },
  }
}

/** dispatch4you.pro — сайт продукта: название там своё, не перевозчика из настроек. */
async function onProductSite() {
  const h = await headers()
  return isProductHost(h.get('x-forwarded-host') ?? h.get('host'))
}

export const viewport: Viewport = {
  themeColor: '#eef0fa',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // getCurrentUser/getLocale only read headers and cookies — no DB, so awaiting them
  // up front costs nothing. Everything below them DOES hit the DB, and it used to go
  // in two waves (company+alerts, then the two capability checks). Since the
  // capability checks only need `user`, which is already in hand, all four go in one
  // wave instead — one round trip's latency off EVERY page in the app, this layout
  // being the one thing every route renders through.
  const [user, locale] = [await getCurrentUser(), await getLocale()]
  // Разовое переименование старых документов по новому правилу (lib/doc-title.ts) —
  // после ответа, страница его не ждёт; дальше это одна проверка флага на процесс.
  after(() => ensureDocTitles())
  const companyId = user?.companyId ?? 'default'
  // .catch — из-за установки. Все четыре запроса здесь оформительские: имя компании
  // в шапке, значок просроченных документов, два пункта меню. Но макет общий для
  // ВСЕХ страниц, включая /login, и на пустой или неподключённой базе он падал
  // раньше, чем страница успевала сказать, что базы нет: человек, только что
  // нажавший «Deploy», видел «Application error» без единой подсказки. Проверено
  // вживую на kgzapp.online.
  //
  // Молчит только оформление: собственные запросы страницы по-прежнему падают
  // громко, и настоящий сбой базы виден на первой же рабочей странице.
  const chrome = await Promise.all([
    getCompany(),
    // Локаль передаётся ОБОИМИ вызывающими (здесь и на главной) одинаково —
    // иначе cache() перестал бы их склеивать и запрос ушёл бы дважды за рендер.
    fleetExpiryAlerts(companyId, locale),
    // Capability-gated nav items — admins always see them; dispatchers per their access.
    can(user, 'telegram'),
    can(user, 'finances'),
  ]).catch(() => null)
  // Overdue/≤30-day document expiries — a badge on the Траки nav item, visible from
  // anywhere in the app, not just the one banner on the dashboard.
  const urgentDocs = (chrome?.[1] ?? []).filter((a) => a.item.tone === 'bad').length
  // Вводная экскурсия для первого администратора. Отдельно от chrome и с тем же
  // .catch: не открылась настройка — это не повод не пустить человека в приложение.
  const tour = await tourSteps(user, locale).catch(() => null)

  return (
    // suppressHydrationWarning: the inline script sets data-theme before hydration,
    // so the server HTML (no attr) and client (attr) legitimately differ on <html>.
    <html lang={locale} suppressHydrationWarning className={`${sans.variable} ${mono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body>
        <LocaleProvider locale={locale}>
          {/* Nav carries the notifications bell and the theme switch — nothing floats
              over the page any more. On /login, middleware never set the user headers,
              so `user` is null here and Nav just doesn't render the account row —
              harmless anyway, since the login form covers the nav completely. */}
          <Nav
            companyName={(await onProductSite()) ? PRODUCT_NAME : (chrome?.[0].name ?? '')}
            user={user}
            showTelegram={chrome?.[2] ?? false}
            showFinances={chrome?.[3] ?? false}
            urgentDocs={urgentDocs}
          />
          {user?.isDemo && <DemoModeBanner />}
          {/* Room for the bottom bar on phones (tabs + utility strip), sidebar on desktop.
              Extra top padding while the demo banner is up — it's fixed, so it would
              otherwise sit on top of the page's own first heading. */}
          <div
            className={`pb-24 md:pb-0 md:pl-[var(--sidebar-w)] md:transition-[padding] md:duration-200 md:ease-out ${
              // Телефон: место под верхнюю панель (3rem), при демо — ещё и под баннер.
              // --sticky-top — где липким полосам (PairBar) прижиматься: под панелью,
              // а в демо ещё и под баннером, иначе баннер их накрывает.
              user?.isDemo
                ? 'pt-[5.25rem] md:pt-9 [--sticky-top:5.5rem] md:[--sticky-top:2.75rem]'
                : 'pt-12 md:pt-0 [--sticky-top:3.25rem] md:[--sticky-top:0.5rem]'
            }`}
          >
            <RevealGuard />
            <BuildWatch mine={process.env.BUILD_STAMP ?? ''} />
            <AlertWatch enabled={!!user && !user.isDemo} />
            {children}
          </div>
          {/* Fixed overlay — outside the padded content wrapper so it isn't offset by
              the desktop sidebar's md:pl-52. */}
          <Toaster />
          {tour && <Tour steps={tour} persist={user?.isDemo ? 'session' : 'local'} />}
        </LocaleProvider>
      </body>
    </html>
  )
}
