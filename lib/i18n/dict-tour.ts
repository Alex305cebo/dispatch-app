// Вводная экскурсия для первого администратора (components/tour.tsx).

export const tourDict = {
  'tour.launcher': { ru: 'Настройка', en: 'Setup' },
  'tour.next': { ru: 'Дальше', en: 'Next' },
  'tour.back': { ru: 'Назад', en: 'Back' },
  'tour.go': { ru: 'Перейти', en: 'Take me there' },
  'tour.done': { ru: 'Готово', en: 'Done' },
  'tour.skip': { ru: 'Пропустить', en: 'Skip' },
  'tour.stepOf': { ru: 'Шаг {n} из {total}', en: 'Step {n} of {total}' },
  'tour.doneMark': { ru: 'уже сделано', en: 'already done' },

  'tour.welcome.title': { ru: 'Здесь всё управление', en: 'Everything is managed here' },
  'tour.welcome.text': {
    ru: 'Это ваш аккаунт: ключи, люди, реквизиты компании. Пять коротких шагов — и приложение готово к работе. Бросить можно в любой момент, шаги останутся.',
    en: 'Your account lives here: keys, people, company details. Five short steps and the app is ready. You can quit any time — the steps stay.',
  },
  'tour.keys.title': { ru: 'Ключи', en: 'API keys' },
  'tour.keys.text': {
    ru: 'Вставьте свои ключи Google AI и HERE. Первый читает рейт-коны и документы за вас, второй считает платные дороги. Оба бесплатные, ключи ваши и лежат в вашей базе.',
    en: 'Paste your own Google AI and HERE keys. The first reads rate cons and documents for you, the second prices toll roads. Both free tiers; the keys are yours and stay in your database.',
  },
  'tour.company.title': { ru: 'Реквизиты компании', en: 'Company details' },
  'tour.company.text': {
    ru: 'Название, MC/DOT, адрес и куда платить. Это попадает в счета — пока не заполнено, счёт не выставить.',
    en: 'Name, MC/DOT, address and remit-to. This goes on your invoices — without it invoicing refuses to run.',
  },
  'tour.users.title': { ru: 'Диспетчеры', en: 'Dispatchers' },
  'tour.users.text': {
    ru: 'Заведите людей, которые будут работать. У каждого свой вход и свой след в журнале — общий пароль на всех не нужен.',
    en: 'Add the people who will work here. Each gets their own login and their own trail in the journal — no shared password.',
  },
  'tour.trucks.title': { ru: 'Первый трак', en: 'Your first truck' },
  'tour.trucks.text': {
    ru: 'Машина, водитель и её экономика: расход, ставка водителю, платежи. Без этих цифр прибыль по грузу — выдумка.',
    en: 'The truck, its driver and its economics: mpg, driver pay, payments. Without those numbers load profit is fiction.',
  },
  'tour.loads.title': { ru: 'Первый груз', en: 'Your first load' },
  'tour.loads.text': {
    ru: 'Перетащите рейт-кон в приложение — оно само вытащит брокера, ставку, адреса и даты. Останется проверить и назначить трак.',
    en: 'Drop a rate con into the app — it pulls out the broker, the rate, the stops and the dates by itself. You check it and assign a truck.',
  },
} as const
