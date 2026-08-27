// Shared vocabulary: load/truck status labels (used across Overview, Loads, Trucks,
// Tracking) plus a handful of generic chrome words. Domain-specific text belongs in
// its own dict-<area>.ts shard — this file is only for words genuinely reused across
// unrelated areas, to avoid five different modules each redefining "Cancel".

export const commonDict = {
  'status.quoted': { ru: 'Букинг', en: 'Quoted', es: 'Cotizado', uk: 'Букінг', ro: 'Cotat' },
  'status.booked': { ru: 'Загрузка', en: 'Booked', es: 'Reservado', uk: 'Завантаження', ro: 'Rezervat' },
  'status.in_transit': { ru: 'В пути', en: 'In transit', es: 'En tránsito', uk: 'У дорозі', ro: 'În tranzit' },
  'status.delivered': { ru: 'Доставлен', en: 'Delivered', es: 'Entregado', uk: 'Доставлено', ro: 'Livrat' },
  'status.paid': { ru: 'Оплачен', en: 'Paid', es: 'Pagado', uk: 'Оплачено', ro: 'Plătit' },
  'status.cancelled': { ru: 'Отменён', en: 'Cancelled', es: 'Cancelado', uk: 'Скасовано', ro: 'Anulat' },

  'common.save': { ru: 'Сохранить', en: 'Save', es: 'Guardar', uk: 'Зберегти', ro: 'Salvează' },
  'common.saving': { ru: 'Сохраняю…', en: 'Saving…', es: 'Guardando…', uk: 'Зберігаю…', ro: 'Se salvează…' },
  'common.cancel': { ru: 'Отмена', en: 'Cancel', es: 'Cancelar', uk: 'Скасувати', ro: 'Anulează' },
  'common.close': { ru: 'Закрыть', en: 'Close', es: 'Cerrar', uk: 'Закрити', ro: 'Închide' },
  'common.delete': { ru: 'Удалить', en: 'Delete', es: 'Eliminar', uk: 'Видалити', ro: 'Șterge' },
  'common.deleting': { ru: 'Удаляю…', en: 'Deleting…', es: 'Eliminando…', uk: 'Видаляю…', ro: 'Se șterge…' },
  'common.edit': { ru: 'Изменить', en: 'Edit', es: 'Editar', uk: 'Змінити', ro: 'Modifică' },
  'common.add': { ru: 'Добавить', en: 'Add', es: 'Añadir', uk: 'Додати', ro: 'Adaugă' },
  'common.loading': { ru: 'Загрузка…', en: 'Loading…', es: 'Cargando…', uk: 'Завантаження…', ro: 'Se încarcă…' },
  'common.noData': { ru: 'Нет данных', en: 'No data', es: 'Sin datos', uk: 'Немає даних', ro: 'Fără date' },

  'app.description': {
    ru: 'Брать или не брать: что груз реально оставляет на траке.',
    en: 'Take it or not: what a load actually leaves on the truck.',
    es: 'Tomarla o no: lo que la carga realmente deja en el camión.',
    uk: 'Брати чи ні: що вантаж насправді залишає на траку.',
    ro: 'O iei sau nu: ce lasă cu adevărat cursa în camion.',
  },
} as const
