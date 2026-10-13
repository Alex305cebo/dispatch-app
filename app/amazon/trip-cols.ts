// Столбцы таблицы рейсов Amazon — общие у строки (trip-row.tsx, клиентская) и у шапки
// (page.tsx, серверная). Отдельным файлом: строку из 'use client'-модуля сервер
// получает ссылкой на клиент, а не текстом.

/** Строка рейса — строкой таблицы (13/10/26, вид SmartHop): статус · рейс · маршрут ·
 *  трак · оплата · действия. Столбец действий — постоянной ширины: у шапки он пустой,
 *  и «auto» сдвигал бы её столбцы против строк. Узко — карточка: статус, рейс и деньги
 *  сверху, под ними маршрут, трак и кнопки. Раскладку решает ширина доски (@container). */
export const TRIP_COLS =
  "grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3 gap-y-2 [grid-template-areas:'status_trip_pay'_'route_route_route'_'truck_truck_truck'_'acts_acts_acts'] @4xl:grid-cols-[6.5rem_minmax(0,0.8fr)_minmax(0,1.8fr)_minmax(0,1.1fr)_minmax(0,0.75fr)_16.5rem] @4xl:items-center @4xl:[grid-template-areas:'status_trip_route_truck_pay_acts']"
