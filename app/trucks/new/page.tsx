import Link from 'next/link'
import { NEW_TRUCK, TruckForm } from '@/components/truck-form'

export default function Page() {
  return (
    <main className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <Link href="/trucks" className="text-[13px] text-white/65 transition-colors hover:text-white/90">
        ← Траки
      </Link>
      <h1 className="mb-1 mt-2 text-[17px] font-semibold">Новый трак</h1>
      <p className="mb-6 max-w-2xl text-[13px] leading-relaxed text-white/65">
        Номер и водитель отличают трак в парке. Экономика — своя у каждого: от неё считается
        break-even и вердикт по грузам именно этого трака.
      </p>
      <TruckForm id={null} initial={NEW_TRUCK} />
    </main>
  )
}
