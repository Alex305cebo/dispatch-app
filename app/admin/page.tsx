import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/session'
import { getCompany } from '@/lib/invoice'
import { CompanyForm } from '@/components/invoice-actions'
import { Info } from '@/components/info'
import { getOpenAccess, listUsers, tgAdminStatus } from './actions'
import { UserList } from './user-list'
import { OpenAccessToggle } from './open-access-toggle'
import { TgSettings } from './tg-settings'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const user = await getCurrentUser()
  // Defense in depth: the nav link is already hidden from non-admins, but a
  // dispatcher typing the URL directly must still be bounced, not shown the panel.
  if (!user || user.role !== 'admin') redirect('/')

  const [users, company, openAccess, tgStatus] = await Promise.all([
    listUsers(),
    getCompany(),
    getOpenAccess(),
    tgAdminStatus(),
  ])

  return (
    <main className="mx-auto max-w-3xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <h1 className="text-[17px] font-semibold">Админ-панель</h1>
      <p className="mb-6 text-[13px] text-white/65">
        Пользователи, настройки компании и журнал действий — видно только администраторам.
      </p>

      <section className="panel p-5">
        <h2 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
          Пользователи
          <Info text="Кто может войти в приложение. Диспетчер видит и делает всё то же, что и раньше — просто под своим именем, а не общим PIN. Отключить — сразу гасит все его текущие входы, не только блокирует новые." />
        </h2>
        <UserList users={users} currentUserId={user.id} />
      </section>

      <section className="panel mt-4 p-5">
        <h2 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
          Открытый доступ
          <Info text="Временно убрать вход для всех — например, чтобы кто-то посмотрел живые данные без своего аккаунта. Эта панель всегда остаётся под входом, чтобы можно было выключить обратно." />
        </h2>
        <OpenAccessToggle enabled={openAccess} />
      </section>

      <section className="panel mt-4 p-5">
        <h2 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
          Настройки компании
          <Info text="Название, MC/DOT, реквизиты — то, что попадает в счета брокерам." />
        </h2>
        <CompanyForm initial={company} />
      </section>

      <section className="panel mt-4 p-5">
        <h2 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
          Telegram
          <Info text="Какой аккаунт подключён, и какие чаты из него показывать в приложении — снятые галочки скрывают чат для всех, не только для тебя." />
        </h2>
        <TgSettings status={tgStatus} />
      </section>

      <section className="panel mt-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
            Журнал действий
            <Info text="Кто и когда заходил, с какого устройства и откуда — плюс удаления документов. Полная версия — по ссылке." />
          </h2>
          <Link href="/logins" className="text-[12px] text-haul-400 hover:underline">
            Открыть →
          </Link>
        </div>
      </section>
    </main>
  )
}
