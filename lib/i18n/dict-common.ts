// Shared vocabulary: load/truck status labels (used across Overview, Loads, Trucks,
// Tracking) plus a handful of generic chrome words. Domain-specific text belongs in
// its own dict-<area>.ts shard — this file is only for words genuinely reused across
// unrelated areas, to avoid five different modules each redefining "Cancel".

export const commonDict = {
  'pair.truck': { ru: 'Трак', en: 'Truck', es: 'Camión', uk: 'Трак', ro: 'Camion', kk: 'Трак' },
  'pair.load': { ru: 'Груз', en: 'Load', es: 'Carga', uk: 'Вантаж', ro: 'Cursă', kk: 'Жүк' },
  'pair.hereTruck': { ru: 'Ты на карточке трака', en: 'You are on the truck card', es: 'Estás en la ficha del camión', uk: 'Ти на картці трака', ro: 'Ești pe fișa camionului', kk: 'Сен трак карточкасындасың' },
  'pair.hereLoad': { ru: 'Ты на карточке груза', en: 'You are on the load card', es: 'Estás en la ficha de la carga', uk: 'Ти на картці вантажу', ro: 'Ești pe fișa cursei', kk: 'Сен жүк карточкасындасың' },
  'pair.openTruck': { ru: 'Открыть карточку трака →', en: 'Open the truck card →', es: 'Abrir la ficha del camión →', uk: 'Відкрити картку трака →', ro: 'Deschide fișa camionului →', kk: 'Трак карточкасын ашу →' },
  'pair.openLoad': { ru: 'Открыть карточку груза →', en: 'Open the load card →', es: 'Abrir la ficha de la carga →', uk: 'Відкрити картку вантажу →', ro: 'Deschide fișa cursei →', kk: 'Жүк карточкасын ашу →' },
  'pair.here': { ru: 'ты здесь', en: 'you are here', es: 'estás aquí', uk: 'ти тут', ro: 'ești aici', kk: 'сен осындасың' },
  'pair.noTruck': { ru: 'Трак не назначен', en: 'No truck assigned', es: 'Sin camión asignado', uk: 'Трак не призначено', ro: 'Niciun camion alocat', kk: 'Трак тағайындалмаған' },
  'pair.noLoad': { ru: 'У трака сейчас нет груза', en: 'No load right now', es: 'Sin carga ahora', uk: 'Зараз без вантажу', ro: 'Fără cursă acum', kk: 'Қазір жүк жоқ' },
  'status.quoted': { ru: 'Букинг', en: 'Quoted', es: 'Cotizado', uk: 'Букінг', ro: 'Cotat', kk: 'Брондау' },
  'status.booked': { ru: 'Загрузка', en: 'Booked', es: 'Reservado', uk: 'Завантаження', ro: 'Rezervat', kk: 'Тиеу' },
  'status.in_transit': { ru: 'В пути', en: 'In transit', es: 'En tránsito', uk: 'У дорозі', ro: 'În tranzit', kk: 'Жолда' },
  'status.delivered': { ru: 'Доставлен', en: 'Delivered', es: 'Entregado', uk: 'Доставлено', ro: 'Livrat', kk: 'Жеткізілді' },
  'status.paid': { ru: 'Оплачен', en: 'Paid', es: 'Pagado', uk: 'Оплачено', ro: 'Plătit', kk: 'Төленді' },
  'status.cancelled': { ru: 'Отменён', en: 'Cancelled', es: 'Cancelado', uk: 'Скасовано', ro: 'Anulat', kk: 'Бас тартылды' },

  'common.staleBuild': { ru: 'Вышло обновление приложения — обнови страницу (Ctrl+F5) и повтори действие.', en: 'The app was updated — refresh the page (Ctrl+F5) and try again.', es: 'La app se actualizó — recarga la página (Ctrl+F5) y repite la acción.', uk: 'Вийшло оновлення застосунку — онови сторінку (Ctrl+F5) і повтори дію.', ro: 'Aplicația s-a actualizat — reîncarcă pagina (Ctrl+F5) și repetă acțiunea.', kk: 'Қосымша жаңарды — бетті жаңартып (Ctrl+F5), әрекетті қайталаңыз.' },
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
