import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/session'
import { getCompany } from '@/lib/invoice'
import { CompanyForm } from '@/components/invoice-actions'
import { Info } from '@/components/info'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { getKeyStatus, getOpenAccess, listUsers } from './actions'
import { UserList } from './user-list'
import { OpenAccessToggle } from './open-access-toggle'
import { KeysForm } from './keys-form'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const user = await getCurrentUser()
  // Defense in depth: the nav link is already hidden from non-admins, but a
  // dispatcher typing the URL directly must still be bounced, not shown the panel.
  if (!user || user.role !== 'admin') redirect('/')
  const locale = await getLocale()

  const [users, company, openAccess, keys] = await Promise.all([
    listUsers(),
    getCompany(),
    getOpenAccess(),
    getKeyStatus(),
  ])

  return (
    <main className="mx-auto max-w-3xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <h1 className="text-xl font-bold tracking-tight">{t(locale, 'admin.title')}</h1>
      <p className="mb-6 text-[13px] text-white/65">{t(locale, 'admin.subtitle')}</p>

      <section className="panel p-5">
        <h2 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
          {t(locale, 'admin.usersHeading')}
          <Info text={t(locale, 'admin.usersInfo')} />
        </h2>
        <UserList users={users} currentUserId={user.id} />
      </section>

      <section className="panel mt-4 p-5">
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
