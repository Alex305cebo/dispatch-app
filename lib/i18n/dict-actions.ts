// app/actions.ts — shared server actions spanning several domains, kept in one
// dictionary shard because the source file itself is a single shared module. Each
// action calls getLocale() internally (same pattern as its existing companyScope()
// calls), so no caller elsewhere in the app needs to change.

export const actionsDict = {
  'actions.needOriginDest': { ru: 'Нужны и откуда, и куда.', en: 'Need both an origin and a destination.', es: 'Hacen falta origen y destino.', uk: 'Потрібні і звідки, і куди.', ro: 'E nevoie și de plecare, și de destinație.' },
  'actions.noAccess': { ru: 'Нет доступа к этой функции.', en: 'No access to this feature.', es: 'Sin acceso a esta función.', uk: 'Немає доступу до цієї функції.', ro: 'Fără acces la această funcție.' },
  'actions.paidNeedsDocs': {
    ru: 'Нельзя отметить «Оплачен»: не загружены {missing} — без них не собрать пакет для счёта.',
    en: 'Can’t mark Paid: {missing} not uploaded — the invoice packet needs them.',
  },
  'actions.loadNotFound': { ru: 'Груз не найден.', en: 'Load not found.', es: 'Carga no encontrada.', uk: 'Вантаж не знайдено.', ro: 'Cursa nu a fost găsită.' },
  'actions.demoDisabled': { ru: 'В демо-режиме недоступно.', en: 'Not available in demo mode.', es: 'No disponible en modo demo.', uk: 'У демо-режимі недоступно.', ro: 'Indisponibil în modul demo.' },
  // Every visitor shares one demo company, so a save here would show up for all of
  // them — and a rate con opened from the Telegram bot link would stop being private.
  'actions.demoReadOnly': {
    ru: 'Демо — только для просмотра. Войдите в свой аккаунт, чтобы сохранять.',
    en: 'Demo is read-only. Sign in to your account to save.',
    es: 'La demo es solo de lectura. Entra en tu cuenta para guardar.',
    uk: 'Демо — лише для перегляду. Увійдіть у свій акаунт, щоб зберігати.',
    ro: 'Demo-ul e doar pentru vizualizare. Autentifică-te în contul tău ca să salvezi.',
  },
  'actions.needNameAndMcDot': { ru: 'Нужны минимум название и MC/DOT.', en: 'Need at least a name and MC/DOT.', es: 'Hacen falta al menos el nombre y el MC/DOT.', uk: 'Потрібні щонайменше назва і MC/DOT.', ro: 'E nevoie cel puțin de nume și MC/DOT.' },
  'actions.truckNotFound': { ru: 'Трак не найден.', en: 'Truck not found.', es: 'Camión no encontrado.', uk: 'Трак не знайдено.', ro: 'Camionul nu a fost găsit.' },
  'actions.rateconNotFound': { ru: 'Рейткон не найден.', en: 'Rate con not found.', es: 'Rate con no encontrado.', uk: 'Рейткон не знайдено.', ro: 'Rate con negăsit.' },
  'actions.rateconAlreadyUsed': {
    ru: 'Из этого рейткона груз уже создан.',
    en: 'A load was already created from this rate con.',
    es: 'De este rate con ya se creó una carga.',
    uk: 'З цього рейткона вантаж уже створено.',
    ro: 'Din acest rate con s-a creat deja o cursă.',
  },
  'actions.aiUnavailable': {
    ru: 'ИИ не подключён — администратор может добавить ключ в разделе Админ → Ключи.',
    en: 'AI is not connected — an admin can add a key in Admin → Keys.',
    es: 'La IA no está conectada — un administrador puede añadir la clave en Admin → Claves.',
    uk: 'ШІ не підключено — адміністратор може додати ключ у розділі Адмін → Ключі.',
    ro: 'IA nu este conectată — un administrator poate adăuga cheia în Admin → Chei.',
  },
  'actions.aiFailedToRead': { ru: 'ИИ не прочитал:', en: 'AI could not read it:', es: 'La IA no lo leyó:', uk: 'ШІ не прочитав:', ro: 'IA nu a putut citi:' },
  'actions.noMilesInRc': {
    ru: 'В рейтконе не указан пробег, и рассчитать его по городам не вышло. Создай груз вручную и впиши мили.',
    en: "The rate con doesn't list mileage, and it couldn't be calculated from the cities. Create the load manually and enter miles.",
  },
  'actions.noFileSelected': { ru: 'Файл не выбран.', en: 'No file selected.', es: 'No se eligió ningún archivo.', uk: 'Файл не вибрано.', ro: 'Niciun fișier ales.' },
  'actions.fileOver8mb': {
    ru: 'Файл больше 8 МБ — сожми или пришли меньше.',
    en: 'File is over 8 MB — compress it or send a smaller one.',
    es: 'El archivo pasa de 8 MB — comprímelo o manda uno menor.',
    uk: 'Файл більший за 8 МБ — стисніть або надішліть менший.',
    ro: 'Fișierul depășește 8 MB — comprimă-l sau trimite unul mai mic.',
  },
  'docModal.openPage': { ru: 'открыть страницей', en: 'open as a page', es: 'abrir como página', uk: 'відкрити сторінкою', ro: 'deschide ca pagină' },
  'actions.docNotFound': { ru: 'Документ не найден.', en: 'Document not found.', es: 'Documento no encontrado.', uk: 'Документ не знайдено.', ro: 'Documentul nu a fost găsit.' },
  'actions.docNotInTrash': { ru: 'Документ не найден в корзине.', en: 'Document not found in the trash.', es: 'El documento no está en la papelera.', uk: 'Документ не знайдено в кошику.', ro: 'Documentul nu e în coșul de gunoi.' },
  'actions.rateNegative': { ru: 'Ставка не может быть отрицательной.', en: 'Rate cannot be negative.', es: 'La tarifa no puede ser negativa.', uk: 'Ставка не може бути від\'ємною.', ro: 'Tariful nu poate fi negativ.' },
  'actions.loadedMilesPositive': {
    ru: 'Гружёные мили должны быть больше 0.',
    en: 'Loaded miles must be more than 0.',
    es: 'Las millas cargadas deben ser mayores que 0.',
    uk: 'Гружені милі мають бути більші за 0.',
    ro: 'Milele încărcate trebuie să fie mai mari ca 0.',
  },
  'actions.deadheadNegative': {
    ru: 'Пустые мили не могут быть отрицательными.',
    en: 'Deadhead miles cannot be negative.',
    es: 'Las millas vacías no pueden ser negativas.',
    uk: 'Порожні милі не можуть бути від\'ємними.',
    ro: 'Milele goale nu pot fi negative.',
  },
  'actions.transitDaysPositive': { ru: 'Дней в пути должно быть больше 0.', en: 'Transit days must be more than 0.', es: 'Los días en ruta deben ser más de 0.', uk: 'Днів у дорозі має бути більше 0.', ro: 'Zilele de drum trebuie să fie mai multe de 0.' },
  'actions.spotRateNegative': {
    ru: 'Рыночная ставка не может быть отрицательной.',
    en: 'Market rate cannot be negative.',
    es: 'La tarifa de mercado no puede ser negativa.',
    uk: 'Ринкова ставка не може бути від\'ємною.',
    ro: 'Tariful de piață nu poate fi negativ.',
  },
  'actions.emptyText': { ru: 'Пустой текст.', en: 'Empty text.', es: 'Texto vacío.', uk: 'Порожній текст.', ro: 'Text gol.' },
  'actions.translateFailed': { ru: 'Не вышло перевести:', en: 'Could not translate:', es: 'No se pudo traducir:', uk: 'Не вдалося перекласти:', ro: 'Nu s-a putut traduce:' },
  'actions.recognizeFailed': { ru: 'Не вышло распознать:', en: 'Could not read it:', es: 'No se pudo leer:', uk: 'Не вдалося розпізнати:', ro: 'Nu s-a putut citi:' },
  'actions.noRcAttached': {
    ru: 'К этому грузу не прикреплён rate con.',
    en: 'No rate con is attached to this load.',
    es: 'A esta carga no hay ningún rate con adjunto.',
    uk: 'До цього вантажу не прикріплено rate con.',
    ro: 'La această cursă nu e atașat niciun rate con.',
  },
  'actions.sayWhatWasDone': { ru: 'Напиши, что делали.', en: 'Say what was done.', es: 'Escribe qué se hizo.', uk: 'Напишіть, що робили.', ro: 'Scrie ce s-a făcut.' },
  'actions.entryNotFound': { ru: 'Запись не найдена.', en: 'Entry not found.', es: 'Registro no encontrado.', uk: 'Запис не знайдено.', ro: 'Înregistrarea nu a fost găsită.' },
  'actions.sayWhatToFix': { ru: 'Напиши, что нужно починить.', en: 'Say what needs fixing.', es: 'Escribe qué hay que arreglar.', uk: 'Напишіть, що треба полагодити.', ro: 'Scrie ce trebuie reparat.' },
  'actions.fileOver4mb': {
    ru: 'Фото больше 4 МБ — сожми или пришли меньше.',
    en: 'Photo is over 4 MB — compress it or send a smaller one.',
    es: 'La foto pasa de 4 MB — comprímela o manda una menor.',
    uk: 'Фото більше 4 МБ — стисніть або надішліть менше.',
    ro: 'Poza depășește 4 MB — comprim-o sau trimite una mai mică.',
  },
  'actions.needImage': { ru: 'Нужно изображение (JPG/PNG).', en: 'Need an image (JPG/PNG).', es: 'Hace falta una imagen (JPG/PNG).', uk: 'Потрібне зображення (JPG/PNG).', ro: 'E nevoie de o imagine (JPG/PNG).' },
  'actions.dispatcherFallback': { ru: 'диспетчер', en: 'dispatcher', es: 'despachador', uk: 'диспетчер', ro: 'dispecer' },
} as const
