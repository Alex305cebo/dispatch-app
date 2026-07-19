import { listTrucks } from '@/lib/loads'
import { QrClient } from './qr-client'
import { BackButton } from '@/components/back-button'

// Reads the DB — without this it prerenders at build time and serves that snapshot forever.
export const dynamic = 'force-dynamic'

export default async function Page() {
  const trucks = await listTrucks()
  return (
    <main className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <BackButton href="/loads" label="Грузы" />
      <h1 className="mb-1 mt-3 text-[17px] font-semibold">Груз с DAT</h1>
      <p className="mb-6 text-[13px] text-white/65">Аналитика считается на телефоне, офлайн.</p>
      <QrClient trucks={trucks} />
    </main>
  )
}
