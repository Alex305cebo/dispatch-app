// Старый адрес «Финансов». Раздел слит с «Файлами» в «Документы» (app/docs/page.tsx):
// вкладки и их имена в адресе прежние, поэтому ссылка из письма, закладки или карточки
// груза открывает то же, что открывала.

import { redirect } from 'next/navigation'

export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const { tab, q } = await searchParams
  const params = new URLSearchParams()
  // Без вкладки это была «Оплата · факторинг» — теперь она и есть вкладка «Грузы».
  if (tab) params.set('tab', tab)
  if (q) params.set('q', q)
  const query = params.toString()
  redirect(query ? `/docs?${query}` : '/docs')
}
