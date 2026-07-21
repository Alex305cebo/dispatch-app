import type { Metadata, Viewport } from 'next'
import { Nav } from '@/components/nav'
import { getCompany } from '@/lib/invoice'
import { getCurrentUser } from '@/lib/session'
import { can } from '@/lib/capabilities-server'
import { fleetExpiryAlerts } from '@/lib/maintenance'
import './globals.css'

// Apply the saved theme before first paint — no flash of the wrong colours.
const THEME_INIT = `try{var t=localStorage.getItem('theme');if(t==='light')document.documentElement.dataset.theme='light'}catch(e){}`

export const metadata: Metadata = {
  title: 'Dispatch',
  description: 'Брать или не брать: что груз реально оставляет на траке.',
  applicationName: 'Dispatch',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Dispatch' },
}

export const viewport: Viewport = {
  themeColor: '#08090d',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [company, user, alerts] = await Promise.all([getCompany(), getCurrentUser(), fleetExpiryAlerts()])
  // Capability-gated nav items — admins always see them; dispatchers per their access.
  const [showTelegram, showFinances] = await Promise.all([can(user, 'telegram'), can(user, 'finances')])
  // Overdue/≤30-day document expiries — a badge on the Траки nav item, visible from
  // anywhere in the app, not just the one banner on the dashboard.
  const urgentDocs = alerts.filter((a) => a.item.tone === 'bad').length

  return (
    // suppressHydrationWarning: the inline script sets data-theme before hydration,
    // so the server HTML (no attr) and client (attr) legitimately differ on <html>.
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body>
        {/* Nav carries the notifications bell and the theme switch — nothing floats
            over the page any more. On /login, middleware never set the user headers,
            so `user` is null here and Nav just doesn't render the account row —
            harmless anyway, since the login form covers the nav completely. */}
        <Nav
          companyName={company.name}
          user={user}
          showTelegram={showTelegram}
          showFinances={showFinances}
          urgentDocs={urgentDocs}
        />
        {/* Room for the bottom bar on phones (tabs + utility strip), sidebar on desktop. */}
        <div className="pb-28 md:pb-0 md:pl-52">{children}</div>
      </body>
    </html>
  )
}
