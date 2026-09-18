import { redirect } from 'next/navigation'

/** Склады живут в разделе «Рынок и брокеры»: старый адрес и закладки ведут туда же. */
export default async function FacilitiesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams
  redirect(`/brokers?view=facilities${q ? `&q=${encodeURIComponent(q)}` : ''}`)
}
