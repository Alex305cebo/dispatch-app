// Shared vocabulary: load/truck status labels (used across Overview, Loads, Trucks,
// Tracking) plus a handful of generic chrome words. Domain-specific text belongs in
// its own dict-<area>.ts shard — this file is only for words genuinely reused across
// unrelated areas, to avoid five different modules each redefining "Cancel".

export const commonDict = {
  'status.quoted': { ru: 'Букинг', en: 'Quoted', es: 'Cotizado', uk: 'Букінг', ro: 'Cotat', kk: 'Брондау' },
  'status.booked': { ru: 'Загрузка', en: 'Booked', es: 'Reservado', uk: 'Завантаження', ro: 'Rezervat', kk: 'Тиеу' },
  'status.in_transit': { ru: 'В пути', en: 'In transit', es: 'En tránsito', uk: 'У дорозі', ro: 'În tranzit', kk: 'Жолда' },
  'status.delivered': { ru: 'Доставлен', en: 'Delivered', es: 'Entregado', uk: 'Доставлено', ro: 'Livrat', kk: 'Жеткізілді' },
  'status.paid': { ru: 'Оплачен', en: 'Paid', es: 'Pagado', uk: 'Оплачено', ro: 'Plătit', kk: 'Төленді' },
  'status.cancelled': { ru: 'Отменён', en: 'Cancelled', es: 'Cancelado', uk: 'Скасовано', ro: 'Anulat', kk: 'Бас тартылды' },

  'common.save': { ru: 'Сохранить', en: 'Save', es: 'Guardar', uk: 'Зберегти', ro: 'Salvează', kk: 'Сақтау' },
  'common.saving': { ru: 'Сохраняю…', en: 'Saving…', es: 'Guardando…', uk: 'Зберігаю…', ro: 'Se salvează…', kk: 'Сақталуда…' },
  'common.cancel': { ru: 'Отмена', en: 'Cancel', es: 'Cancelar', uk: 'Скасувати', ro: 'Anulează', kk: 'Болдырмау' },
  'common.close': { ru: 'Закрыть', en: 'Close', es: 'Cerrar', uk: 'Закрити', ro: 'Închide', kk: 'Жабу' },
  'common.delete': { ru: 'Удалить', en: 'Delete', es: 'Eliminar', uk: 'Видалити', ro: 'Șterge', kk: 'Жою' },
  'common.deleting': { ru: 'Удаляю…', en: 'Deleting…', es: 'Eliminando…', uk: 'Видаляю…', ro: 'Se șterge…', kk: 'Жойылуда…' },
  'common.edit': { ru: 'Изменить', en: 'Edit', es: 'Editar', uk: 'Змінити', ro: 'Modifică', kk: 'Өзгерту' },
  'common.add': { ru: 'Добавить', en: 'Add', es: 'Añadir', uk: 'Додати', ro: 'Adaugă', kk: 'Қосу' },
  'common.loading': { ru: 'Загрузка…', en: 'Loading…', es: 'Cargando…', uk: 'Завантаження…', ro: 'Se încarcă…', kk: 'Жүктелуде…' },
  'common.noData': { ru: 'Нет данных', en: 'No data', es: 'Sin datos', uk: 'Немає даних', ro: 'Fără date', kk: 'Дерек жоқ' },

  'app.description': {
    ru: 'Брать или не брать: что груз реально оставляет на траке.',
    en: 'Take it or not: what a load actually leaves on the truck.',
    es: 'Tomarla o no: lo que la carga realmente deja en el camión.',
    uk: 'Брати чи ні: що вантаж насправді залишає на траку.',
    ro: 'O iei sau nu: ce lasă cu adevărat cursa în camion.',
    kk: 'Алу керек пе, жоқ па: жүк тракқа шын мәнінде не қалдырады.',
  },
} as const
