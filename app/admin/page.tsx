import { Mail, ScrollText } from 'lucide-react'
import { getCurrentUser } from '@/lib/session'
import { redirect } from 'next/navigation'
import { ProfileSettings } from '@/components/profile-settings'
import { tilesEnabled } from '@/lib/tiles'
import { dispatcherPhoneKey, getSetting } from '@/lib/settings'
import { getCompany } from '@/lib/invoice'
import { CompanyForm } from '@/components/invoice-actions'
import { Info } from '@/components/info'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/button'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { getBrokerMapLink, getDemoConfig, getKeyStatus, getOpenAccess, getReportStatus, listFleetForAssign, listRecentErrors, listUsers, listWorkspaces } from './actions'
import { UserList } from './user-list'
import { WorkspaceList } from './workspace-list'
import { OpenAccessToggle } from './open-access-toggle'
import { KeysForm } from './keys-form'
import { ReportForm } from './report-form'
import { DemoToggle } from './demo-toggle'
import { BrokerMapLink } from './broker-map-link'

export const dynamic = 'force-dynamic'

/**
 * «Настройки» (11/07/26, бывшая «Админ-панель»): один пункт внизу меню вместо трёх
 * мест — меню аватара, Админки и низа меню. Сверху «Профиль» — его видит каждый, кто
 * вошёл (свой номер, язык, пароль, дата для «Забыли пароль?»); дальше — разделы
 * администратора: люди и права, отчёт на почту, карта для брокеров, кабинеты,
 * компания, ключи, доступ, демо, сбои. Диспетчер видит только «Профиль».
 */
export default async function AdminPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/')
  const locale = await getLocale()
  const admin = user.role === 'admin' && !user.isWorkspace
  const [tiles, myPhone, co] = await Promise.all([
    tilesEnabled(),
    getSetting(dispatcherPhoneKey(user.id)),
    getCompany().catch(() => null),
  ])
  const profile = (
    <section id="profile" className="scroll-mt-4 panel p-5">
      <h2 className="mb-3 flex items-center gap-1.5 text-base leading-6 font-semibold text-t1">
        {t(locale, 'admin.profileHeading')}
        <Info text={t(locale, 'admin.profileInfo')} />
      </h2>
      <ProfileSettings
        admin={admin}
        tilesEnabled={tiles}
        dispatcherPhone={myPhone ?? ''}
        company={co ? { mc: co.mcdot.replace(/^MC[\s#-]*/i, ''), name: co.name, email: co.email } : null}
      />
    </section>
  )

  if (!admin) {
    return (
      <main className="page">
        <PageHeader title={t(locale, 'admin.title')} subtitle={t(locale, 'admin.profileSubtitle')} />
        {profile}
      </main>
    )
  }

  const [users, company, openAccess, keys, demo, fleet, errors, workspaces, report, brokerMap] = await Promise.all([
    listUsers(),
    getCompany(),
    getOpenAccess(),
    getKeyStatus(),
    getDemoConfig(),
    listFleetForAssign(),
    listRecentErrors().catch(() => []),
    listWorkspaces().catch(() => []),
    getReportStatus(),
    getBrokerMapLink(),
  ])

  return (
    // Ширина и шапка — общие для всех страниц (план «Порядок в TMS», 10/09/26).
    <main className="page">
      <PageHeader
        title={t(locale, 'admin.title')}
        subtitle={t(locale, 'admin.subtitle')}
        actions={
          <>
            {/* Отчёт на почту — владелец ищет его в настройках, кнопка ведёт прямо к нему. */}
            <Button href="#report" external variant="secondary" icon={<Mail size={14} aria-hidden />}>
              {t(locale, 'admin.report.heading')}
            </Button>
            <Button href="/logins" variant="secondary" icon={<ScrollText size={14} aria-hidden />}>
              {t(locale, 'admin.journalHeading')}
            </Button>
          </>
        }
      />
      {profile}
      {/* Порядок — по частоте: пользователей и права трогают каждую неделю, реквизиты
          и ключи — при настройке, доступ/демо — раз в жизни, сбои — когда что-то
          сломалось. Ссылка на журнал — в шапке, отдельной пустой секции она не стоит. */}
      <section className="panel mt-4 p-5" data-tour="users">
        <h2 className="mb-3 flex items-center gap-1.5 text-base leading-6 font-semibold text-t1">
          {t(locale, 'admin.usersHeading')}
          <Info text={t(locale, 'admin.usersInfo')} />
        </h2>
        <UserList users={users} currentUserId={user.id} fleet={fleet} />
      </section>
      {/* Отчёт на почту — сразу под людьми: его настраивают и проверяют кнопкой, а
          владелец ищет его здесь, а не среди ключей. */}
      <section id="report" className="scroll-mt-4 panel mt-4 p-5">
        <h2 className="mb-3 flex items-center gap-1.5 text-base leading-6 font-semibold text-t1">
          {t(locale, 'admin.report.heading')}
          <Info text={t(locale, 'admin.report.info')} />
        </h2>
        <ReportForm status={report} />
      </section>
      {/* Карта для брокеров — одна ссылка на всех (lib/broker-map.ts). Владелец ищет её
          рядом с отчётом, а кнопка в шапке «Траков» ведёт прямо сюда. */}
      <section id="broker-map" className="scroll-mt-4 panel mt-4 p-5">
        <h2 className="mb-3 flex items-center gap-1.5 text-base leading-6 font-semibold text-t1">
          {t(locale, 'admin.brokerMap.heading')}
          <Info text={t(locale, 'admin.brokerMap.info')} />
        </h2>
        <BrokerMapLink token={brokerMap} />
      </section>
      <section className="panel mt-4 p-5">
        <h2 className="mb-3 flex items-center gap-1.5 text-base leading-6 font-semibold text-t1">
          {t(locale, 'admin.workspaces.heading')} · {workspaces.length}
          <Info text={t(locale, 'admin.workspaces.info')} />
        </h2>
        <WorkspaceList items={workspaces} />
      </section>
      <section id="company" className="scroll-mt-4 panel mt-4 p-5" data-tour="company">
        <h2 className="mb-3 flex items-center gap-1.5 text-base leading-6 font-semibold text-t1">
          {t(locale, 'admin.companyHeading')}
          <Info text={t(locale, 'admin.companyInfo')} />
        </h2>
        <CompanyForm initial={company} />
      </section>
      <section className="panel mt-4 p-5" data-tour="keys">
        <h2 className="mb-3 flex items-center gap-1.5 text-base leading-6 font-semibold text-t1">
          {t(locale, 'admin.keysHeading')}
          <Info text={t(locale, 'admin.keysInfo')} />
        </h2>
        <KeysForm status={keys} />
      </section>
      <section className="panel mt-4 p-5">
        <h2 className="mb-3 flex items-center gap-1.5 text-base leading-6 font-semibold text-t1">
          {t(locale, 'admin.openAccessHeading')}
          <Info text={t(locale, 'admin.openAccessInfo')} />
        </h2>
        <OpenAccessToggle enabled={openAccess} />
      </section>
      <section className="panel mt-4 p-5">
        <h2 className="mb-3 flex items-center gap-1.5 text-base leading-6 font-semibold text-t1">
          {t(locale, 'admin.demoPublicHeading')}
          <Info text={t(locale, 'admin.demoPublicInfo')} />
        </h2>
        <DemoToggle enabled={demo.enabled} url={demo.url} />
      </section>
      <section className="panel mt-4 p-5">
        <h2 className="mb-3 flex items-center gap-1.5 text-base leading-6 font-semibold text-t1">
          {t(locale, 'admin.errorsHeading')}
          <Info text={t(locale, 'admin.errorsInfo')} />
        </h2>
        {errors.length === 0 ? (
          <p className="text-base text-t3">{t(locale, 'admin.errorsNone')}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {errors.map((e) => (
              <li key={e.id} className="rounded-lg border border-white/6 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-baseline gap-x-2 text-t3">
                  <span className="nums">{e.at.slice(0, 16).replace('T', ' ')}</span>
                  <span className="font-medium text-t2">{e.path}</span>
                  {e.user && <span>· {e.user}</span>}
                  {e.digest && <span className="nums">· {e.digest}</span>}
                </div>
                <div className="mt-0.5 break-words text-t1">{e.message}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
