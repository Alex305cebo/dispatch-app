// Shared vocabulary: load/truck status labels (used across Overview, Loads, Trucks,
// Tracking) plus a handful of generic chrome words. Domain-specific text belongs in
// its own dict-<area>.ts shard — this file is only for words genuinely reused across
// unrelated areas, to avoid five different modules each redefining "Cancel".

export const commonDict = {
  'status.quoted': { ru: 'Букинг', en: 'Quoted' },
  'status.booked': { ru: 'Загрузка', en: 'Booked' },
  'status.in_transit': { ru: 'В пути', en: 'In transit' },
  'status.delivered': { ru: 'Доставлен', en: 'Delivered' },
  'status.paid': { ru: 'Оплачен', en: 'Paid' },
  'status.cancelled': { ru: 'Отменён', en: 'Cancelled' },

  'common.save': { ru: 'Сохранить', en: 'Save' },
  'common.saving': { ru: 'Сохраняю…', en: 'Saving…' },
  'common.cancel': { ru: 'Отмена', en: 'Cancel' },
  'common.close': { ru: 'Закрыть', en: 'Close' },
  'common.delete': { ru: 'Удалить', en: 'Delete' },
  'common.deleting': { ru: 'Удаляю…', en: 'Deleting…' },
  'common.edit': { ru: 'Изменить', en: 'Edit' },
  'common.add': { ru: 'Добавить', en: 'Add' },
  'common.loading': { ru: 'Загрузка…', en: 'Loading…' },
  'common.noData': { ru: 'Нет данных', en: 'No data' },

  'app.description': {
    ru: 'Брать или не брать: что груз реально оставляет на траке.',
    en: 'Take it or not: what a load actually leaves on the truck.',
  },
} as const
