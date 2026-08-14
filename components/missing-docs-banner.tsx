import { DocButton } from '@/components/doc-button'
import { t } from '@/lib/i18n'
import type { Locale } from '@/lib/i18n'
import type { LoadStatus } from '@/lib/map'

/**
 * Постоянное напоминание о недостающих BOL/POD — то, что заменило запрет.
 *
 * Раньше «Доставлен» просто не нажимался, пока обе бумаги не загружены, и всплывающее
 * сообщение об этом жило три секунды. Диспетчер видел неверный статус и предупреждение,
 * которое тут же исчезало. Теперь статус ставится честно, а нехватка бумаг висит на
 * странице сама — вместе с кнопками загрузки, чтобы закрыть её, не уходя отсюда.
 *
 * Появляется, только когда бумага уже ДОЛЖНА быть: BOL — с момента погрузки, POD —
 * с момента, когда груз в пути. На только что забронированном грузе не мозолит глаза.
 */
export function MissingDocsBanner({
  loadId,
  status,
  bolId,
  podId,
  locale,
}: {
  loadId: number
  status: LoadStatus
  bolId: number | null
  podId: number | null
  locale: Locale
}) {
  if (status === 'quoted' || status === 'cancelled') return null
  const needBol = !bolId
  const needPod = !podId && status !== 'booked'
  if (!needBol && !needPod) return null

  const missing = [needBol ? 'BOL' : null, needPod ? 'POD' : null].filter(Boolean).join(' + ')
  // «Оплачен» — единственный статус, который бумаги по-прежнему держат (пакет для
  // счёта без них не собрать), поэтому текст об этом честно предупреждает заранее.
  const blocksPaid = status === 'delivered'

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-warn-400/35 bg-warn-500/[0.09] p-4 sm:flex-row sm:items-center">
      <span className="mt-px flex size-7 shrink-0 items-center justify-center rounded-lg bg-warn-500/20 text-warn-400 ring-1 ring-warn-400/25">
        <span className="text-[14px] leading-none">📄</span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-2xs font-semibold uppercase tracking-wider text-warn-400">
          {t(locale, 'loadDetail.docsMissingTitle').replace('{missing}', missing)}
        </p>
        <p className="mt-0.5 text-[13px] text-white/75">
          {t(locale, blocksPaid ? 'loadDetail.docsMissingBlocksPaid' : 'loadDetail.docsMissingHint')}
        </p>
      </div>
      <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex sm:gap-3">
        {needBol && <DocButton label="BOL" kind="bol" docId={null} loadId={loadId} />}
        {needPod && <DocButton label="POD" kind="pod" docId={null} loadId={loadId} />}
      </div>
    </div>
  )
}
