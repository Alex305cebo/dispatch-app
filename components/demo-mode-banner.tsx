// Fixed top strip while signed in as the public demo account — makes it impossible
// to mistake a sandbox full of fake trucks/loads for the real fleet. Every page under
// the nav gets extra top padding to make room for it (app/layout.tsx).

import { t } from '@/lib/i18n'
import Link from 'next/link'
import { getLocale } from '@/lib/i18n-server'

export async function DemoModeBanner() {
  const locale = await getLocale()
  return (
    <div className="fixed inset-x-0 top-0 z-40 flex items-center justify-center gap-2 bg-haul-500 px-3 py-1.5 text-center text-[12px] font-medium text-white md:pl-52">
      🧪 {t(locale, 'demo.banner')}
      <Link href="/login" className="underline underline-offset-2 hover:no-underline">
        {t(locale, 'demo.signIn')}
      </Link>
    </div>
  )
}
