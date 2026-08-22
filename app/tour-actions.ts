'use server'

import { getCurrentUser } from '@/lib/session'
import { setSetting } from '@/lib/settings'

/** «Готово» — больше не показывать. В базе, а не в браузере: настройку проходят
 * один раз, и всплывать заново на другом устройстве она не должна. */
export async function finishTour(): Promise<void> {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') return
  await setSetting(`tour_done:${user.id}`, '1')
}
