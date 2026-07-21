import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/session'
import { getCompany } from '@/lib/invoice'
import { CompanyForm } from '@/components/invoice-actions'
import { Info } from '@/components/info'
import { getOpenAccess, listUsers } from './actions'
import { UserList } from './user-list'
import { OpenAccessToggle } from './open-access-toggle'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const user = await getCurrentUser()
  // Defense in depth: the nav link is already hidden from non-admins, but a
  // dispatcher typing the URL directly must still be bounced, not shown the panel.
  if (!user || user.role !== 'admin') redirect('/')

  const [users, company, openAccess] = await Promise.all([listUsers(), getCompany(), getOpenAccess()])

  return (
    <main className="mx-auto max-w-3xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <h1 className="text-[17px] font-semibold">Админ-панель</h1>
      <p className="mb-6 text-[13px] text-white/65">
        Пользователи, права, настройки компании и журнал действий — видно только администраторам.
      </p>

      <section className="panel p-5">
        <h2 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
          Пользователи и права
          <Info text="Кто может войти в приложение. У каждого диспетчера под «Права диспетчера» — переключатели доступа к функциям (отчёты, Telegram, финансы и т.д.). Отключить пользователя — сразу гасит все его текущие входы." />
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
          На очереди
          <Info text="Реально можно построить, но нужны детали от тебя, прежде чем начинать — без них это просто макет, а не рабочая функция." />
        </h2>
        <div className="flex flex-col gap-2.5">
          <div className="rounded-lg border border-white/6 bg-white/[0.015] p-3">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-medium">Факторинг в 1 клик</span>
              <span className="rounded-full bg-white/8 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-white/55">
                скоро
              </span>
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-white/60">
              Автоматическая отправка собранного инвойса твоей факторинговой компании. Нужно от
              тебя: с какой компанией работаешь (Apex Capital, Triumph, RTS и т.п.) и доступ к их
              API/порталу — обычно выдают клиенту по запросу.
            </p>
          </div>
          <div className="rounded-lg border border-white/6 bg-white/[0.015] p-3">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-medium">IFTA-отчёт в 1 клик</span>
              <span className="rounded-full bg-white/8 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-white/55">
                скоро
              </span>
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-white/60">
              Автоматический расчёт квартального топливного налога по штатам. Нужно от тебя: базовый
              штат регистрации IFTA и источник миль/топлива по штатам (ELD, если провайдер их отдаёт,
              или квитанции вручную).
            </p>
          </div>
        </div>
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
