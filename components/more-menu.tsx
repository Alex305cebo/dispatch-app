import { Ellipsis } from 'lucide-react'

/** «Ещё» — редкие действия строки за одной кнопкой (снять отметку оплаты, удалить).
 * Нативный <details>: без JS и состояния, работает из серверных компонентов; внутрь
 * кладутся готовые кнопки и ссылки. */
export function MoreMenu({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="relative shrink-0">
      <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1 rounded-lg border border-white/10 px-2.5 text-[12px] font-medium text-white/70 transition-colors hover:border-white/25 hover:text-white max-md:min-h-11 [&::-webkit-details-marker]:hidden">
        <Ellipsis size={14} strokeWidth={2.2} />
        {label}
      </summary>
      <div className="absolute right-0 top-full z-20 mt-1 flex min-w-40 flex-col gap-1 rounded-lg border border-white/12 bg-ink-800 p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.32)]">
        {children}
      </div>
    </details>
  )
}
