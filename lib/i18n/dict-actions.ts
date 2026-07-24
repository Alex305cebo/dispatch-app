// app/actions.ts — shared server actions spanning several domains, kept in one
// dictionary shard because the source file itself is a single shared module. Each
// action calls getLocale() internally (same pattern as its existing companyScope()
// calls), so no caller elsewhere in the app needs to change.

export const actionsDict = {
  'actions.needOriginDest': { ru: 'Нужны и откуда, и куда.', en: 'Need both an origin and a destination.' },
  'actions.noAccess': { ru: 'Нет доступа к этой функции.', en: 'No access to this feature.' },
  'actions.deliveredNeedsDocs': {
    ru: 'Нельзя отметить «Доставлен»: не загружены {missing}.',
    en: 'Can’t mark Delivered: {missing} not uploaded.',
  },
  'actions.loadNotFound': { ru: 'Груз не найден.', en: 'Load not found.' },
  'actions.demoDisabled': { ru: 'В демо-режиме недоступно.', en: 'Not available in demo mode.' },
  'actions.needNameAndMcDot': { ru: 'Нужны минимум название и MC/DOT.', en: 'Need at least a name and MC/DOT.' },
  'actions.truckNotFound': { ru: 'Трак не найден.', en: 'Truck not found.' },
  'actions.rateconNotFound': { ru: 'Рейткон не найден.', en: 'Rate con not found.' },
  'actions.rateconAlreadyUsed': {
    ru: 'Из этого рейткона груз уже создан.',
    en: 'A load was already created from this rate con.',
  },
  'actions.aiUnavailable': {
    ru: 'ИИ временно недоступен — обратись к администратору.',
    en: 'AI is temporarily unavailable — contact the administrator.',
  },
  'actions.aiFailedToRead': { ru: 'ИИ не прочитал:', en: 'AI could not read it:' },
  'actions.noMilesInRc': {
    ru: 'В рейтконе не указан пробег, и рассчитать его по городам не вышло. Создай груз вручную и впиши мили.',
    en: "The rate con doesn't list mileage, and it couldn't be calculated from the cities. Create the load manually and enter miles.",
  },
  'actions.noFileSelected': { ru: 'Файл не выбран.', en: 'No file selected.' },
  'actions.fileOver8mb': {
    ru: 'Файл больше 8 МБ — сожми или пришли меньше.',
    en: 'File is over 8 MB — compress it or send a smaller one.',
  },
  'actions.docNotFound': { ru: 'Документ не найден.', en: 'Document not found.' },
  'actions.docNotInTrash': { ru: 'Документ не найден в корзине.', en: 'Document not found in the trash.' },
  'actions.rateNegative': { ru: 'Ставка не может быть отрицательной.', en: 'Rate cannot be negative.' },
  'actions.loadedMilesPositive': {
    ru: 'Гружёные мили должны быть больше 0.',
    en: 'Loaded miles must be more than 0.',
  },
  'actions.deadheadNegative': {
    ru: 'Пустые мили не могут быть отрицательными.',
    en: 'Deadhead miles cannot be negative.',
  },
  'actions.transitDaysPositive': { ru: 'Дней в пути должно быть больше 0.', en: 'Transit days must be more than 0.' },
  'actions.spotRateNegative': {
    ru: 'Рыночная ставка не может быть отрицательной.',
    en: 'Market rate cannot be negative.',
  },
  'actions.emptyText': { ru: 'Пустой текст.', en: 'Empty text.' },
  'actions.translateFailed': { ru: 'Не вышло перевести:', en: 'Could not translate:' },
  'actions.recognizeFailed': { ru: 'Не вышло распознать:', en: 'Could not read it:' },
  'actions.noRcAttached': {
    ru: 'К этому грузу не прикреплён rate con.',
    en: 'No rate con is attached to this load.',
  },
  'actions.sayWhatWasDone': { ru: 'Напиши, что делали.', en: 'Say what was done.' },
  'actions.entryNotFound': { ru: 'Запись не найдена.', en: 'Entry not found.' },
  'actions.sayWhatToFix': { ru: 'Напиши, что нужно починить.', en: 'Say what needs fixing.' },
  'actions.fileOver4mb': {
    ru: 'Фото больше 4 МБ — сожми или пришли меньше.',
    en: 'Photo is over 4 MB — compress it or send a smaller one.',
  },
  'actions.needImage': { ru: 'Нужно изображение (JPG/PNG).', en: 'Need an image (JPG/PNG).' },
  'actions.dispatcherFallback': { ru: 'диспетчер', en: 'dispatcher' },
} as const
