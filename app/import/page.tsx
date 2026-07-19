import { listTrucks } from '@/lib/loads'
import { ImportClient } from './import-client'
import { BackButton } from '@/components/back-button'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const trucks = await listTrucks()
  return (
    <main className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <BackButton href="/loads" label="Грузы" />
      <h1 className="mb-1 mt-3 text-[17px] font-semibold">
        Rate confirmation <span className="text-[13px] font-normal text-white/50">· подтверждение ставки от брокера</span>
      </h1>
      <p className="mb-6 max-w-2xl text-[13px] leading-relaxed text-white/65">
        Мгновенный черновик собирается прямо в браузере, затем документ проверяет ИИ
        (Google Gemini, бесплатно) — он читает любой шаблон брокера и сканы. Ничего не
        выдумывается: чего нет в документе, то остаётся пустым.
      </p>
      <ImportClient trucks={trucks} />
    </main>
  )
}
