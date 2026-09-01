import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/session'
import { getCompany } from '@/lib/invoice'
import { CompanyForm } from '@/components/invoice-actions'
import { Info } from '@/components/info'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { getDemoConfig, getKeyStatus, getOpenAccess, listFleetForAssign, listRecentErrors, listUsers } from './actions'
import { UserList } from './user-list'
import { OpenAccessToggle } from './open-access-toggle'
import { KeysForm } from './keys-form'
import { DemoToggle } from './demo-toggle'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const user = await getCurrentUser()
  // Defense in depth: the nav link is already hidden from non-admins, but a
  // dispatcher typing the URL directly must still be bounced, not shown the panel.
  if (!user || user.role !== 'admin') redirect('/')
  const locale = await getLocale()

  const [users, company, openAccess, keys, demo, fleet, errors] = await Promise.all([
    listUsers(),
    getCompany(),
    getOpenAccess(),
    getKeyStatus(),
    getDemoConfig(),
    listFleetForAssign(),
    listRecentErrors().catch(() => []),
  ])

  return (
    <main className="mx-auto max-w-3xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <h1 className="text-xl font-bold tracking-tight">{t(locale, 'admin.title')}</h1>
      <p className="mb-6 text-[13px] text-white/65">{t(locale, 'admin.subtitle')}</p>

      <section className="panel p-5" data-tour="users">
        <h2 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
          {t(locale, 'admin.usersHeading')}
          <Info text={t(locale, 'admin.usersInfo')} />
        </h2>
        <UserList users={users} currentUserId={user.id} fleet={fleet} />
      </section>

      <section className="panel mt-4 p-5" data-tour="keys">
        <h2 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
          {t(locale, 'admin.keysHeading')}
          <Info text={t(locale, 'admin.keysInfo')} />
        </h2>
        <KeysForm status={keys} />
      </section>

      <section className="panel mt-4 p-5">
        <h2 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
          {t(locale, 'admin.openAccessHeading')}
          <Info text={t(locale, 'admin.openAccessInfo')} />
        </h2>
        <OpenAccessToggle enabled={openAccess} />
      </section>

      <section className="panel mt-4 p-5">
        <h2 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
          {t(locale, 'admin.errorsHeading')}
          <Info text={t(locale, 'admin.errorsInfo')} />
        </h2>
        {errors.length === 0 ? (
          <p className="text-[13px] text-white/50">{t(locale, 'admin.errorsNone')}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {errors.map((e) => (
              <li key={e.id} className="rounded-lg border border-white/6 px-3 py-2 text-[12px]">
                <div className="flex flex-wrap items-baseline gap-x-2 text-white/45">
                  <span className="nums">{e.at.slice(0, 16).replace('T', ' ')}</span>
                  <span className="font-medium text-white/70">{e.path}</span>
                  {e.user && <span>· {e.user}</span>}
                  {e.digest && <span className="nums">· {e.digest}</span>}
                </div>
                <div className="mt-0.5 break-words text-white/80">{e.message}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel mt-4 p-5">
        <h2 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
          {t(locale, 'admin.demoPublicHeading')}
          <Info text={t(locale, 'admin.demoPublicInfo')} />
        </h2>
        <DemoToggle enabled={demo.enabled} url={demo.url} />
      </section>

      <section className="panel mt-4 p-5" data-tour="company">
        <h2 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
          {t(locale, 'admin.companyHeading')}
          <Info text={t(locale, 'admin.companyInfo')} />
        </h2>
        <CompanyForm initial={company} />
      </section>

      <section className="panel mt-4 p-5">
        <h2 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
          {t(locale, 'admin.upNextHeading')}
          <Info text={t(locale, 'admin.upNextInfo')} />
        </h2>
        <div className="flex flex-col gap-2.5">
          <div className="rounded-lg border border-white/6 bg-white/[0.015] p-3">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-medium">{t(locale, 'admin.factoringTitle')}</span>
              <span className="rounded-full bg-white/8 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-white/55">
                {t(locale, 'nav.soon')}
              </span>
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-white/60">{t(locale, 'admin.factoringDesc')}</p>
          </div>
          <div className="rounded-lg border border-white/6 bg-white/[0.015] p-3">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-medium">{t(locale, 'admin.iftaTitle')}</span>
              <span className="rounded-full bg-white/8 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-white/55">
                {t(locale, 'nav.soon')}
              </span>
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-white/60">{t(locale, 'admin.iftaDesc')}</p>
          </div>
        </div>
      </section>

      <section className="panel mt-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
            {t(locale, 'admin.journalHeading')}
            <Info text={t(locale, 'admin.journalInfo')} />
          </h2>
          <Link href="/logins" className="text-[12px] text-haul-400 hover:underline">
            {t(locale, 'admin.journalOpen')}
          </Link>
        </div>
      </section>
    </main>
  )
}
