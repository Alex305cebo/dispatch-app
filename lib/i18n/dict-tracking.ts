// Tracking domain: app/tracking/**, app/track/[id]/**, fleet-map/fleet-list/
// eld-links/refresh-fleet-button/small-refresh-button, lib/map.ts, lib/load-map.ts,
// lib/geo-routing.ts, lib/eld.ts.

export const trackingDict = {
  // lib/load-map.ts pin labels — shared by the truck page and the load page maps.
  'tracking.pickupPrefix': { ru: 'Пикап · ', en: 'Pickup · ' },
  'tracking.fromPrefix': { ru: 'Из ', en: 'From ' },
  'tracking.toDelivery': { ru: ' до delivery', en: ' to delivery' },
  'tracking.updatedPrefix': { ru: 'обновлено ', en: 'updated ' },
  'tracking.noSnapshotYet': { ru: 'снимков ещё не было', en: 'no snapshot yet' },

  // Public /track/[id] share link (no login).
  'tracking.truckHash': { ru: 'Трак ', en: 'Truck ' },
  'tracking.noData': { ru: 'Нет данных', en: 'No data' },
  'tracking.noCoordsYet': { ru: 'Координаты пока не пришли.', en: 'No coordinates yet.' },

  // app/tracking/page.tsx
  'tracking.title': { ru: 'Трекинг', en: 'Tracking' },
  'tracking.infoText': {
    ru: 'Живая карта парка. На карте — где сейчас каждый трак и линия по дорогам до места выгрузки. В списке — статус (в движении/off/on), последняя локация, скорость и сколько осталось ехать до выгрузки. Координаты обновляются автоматически.',
    en: 'Live fleet map. The map shows where every truck is now and the road route to its delivery point. The list below shows status (moving/off/on), last location, speed, and how far is left to delivery. Coordinates update automatically.',
  },
  'tracking.subtitle': {
    ru: 'Где траки, куда едут и сколько осталось до выгрузки — вживую.',
    en: 'Where the trucks are, where they are headed, and how far to delivery — live.',
  },
  'tracking.moving': { ru: 'в движении', en: 'moving' },
  'tracking.resting': { ru: 'стоят', en: 'stopped' },
  'tracking.noGpsBadge': { ru: 'без GPS', en: 'no GPS' },
  'tracking.fleetTotalSuffix': { ru: 'суммарно до выгрузки по парку', en: 'total fleet miles to delivery' },

  // components/fleet-map.tsx
  'tracking.openArrow': { ru: 'Открыть', en: 'Open' },
  'tracking.noCoordsPanel': {
    ru: 'Координат пока нет — подключи отслеживание траков в разделе «Трекинг».',
    en: 'No coordinates yet — connect truck tracking in the Tracking section.',
  },
  'tracking.mapLabel': { ru: '🗺 Карта', en: '🗺 Map' },
  'tracking.satelliteLabel': { ru: '🛰 Спутник', en: '🛰 Satellite' },
  'tracking.legendMoving': { ru: 'едет', en: 'moving' },
  'tracking.legendStopped': { ru: 'стоит', en: 'stopped' },

  // components/fleet-list.tsx
  'tracking.addressCopiedPrefix': { ru: 'Адрес скопирован: ', en: 'Address copied: ' },
  'tracking.clipboardDenied': {
    ru: 'Браузер не дал буфер — выдели адрес вручную',
    en: 'Browser denied clipboard access — select the address manually',
  },
  'tracking.copyLocationTitle': { ru: 'Скопировать адрес местоположения трака', en: 'Copy truck location address' },
  'tracking.noEldData': { ru: 'Нет данных с ELD', en: 'No data from ELD' },
  'tracking.repairLabel': { ru: '🔧 В ремонте', en: '🔧 In repair' },
  'tracking.vacationLabel': { ru: '🌴 Отпуск', en: '🌴 Vacation' },
  'tracking.idlePrefix': { ru: '⏸ стоит на месте ~', en: '⏸ stopped ~' },
  'tracking.idleSuffix': { ru: 'ч — груз в пути', en: 'h — load in transit' },
  'tracking.toDeliveryLabel': { ru: 'До выгрузки · ', en: 'To delivery · ' },
  'tracking.noActiveLoad': { ru: 'Нет активного груза', en: 'No active load' },
  'tracking.call': { ru: '📞 Позвонить', en: '📞 Call' },
  'tracking.openLoad': { ru: 'Открыть груз', en: 'Open load' },
  'tracking.tripHistory': { ru: 'История пути →', en: 'Trip history →' },
  'tracking.allTrucksBusy': { ru: 'Все траки сейчас в работе.', en: 'All trucks are on a load right now.' },
  'tracking.freeTrucks': { ru: 'Свободные траки', en: 'Free trucks' },

  // components/eld-links.tsx
  'tracking.trackingHeader': { ru: 'Отслеживание траков', en: 'Truck tracking' },
  'tracking.connectedSuffix': { ru: '· подключено ', en: '· connected ' },
  'tracking.eldLinksInfo': {
    ru: 'Вставь ссылки отслеживания траков — по одной на строку. Координаты и скорость обновляются сами.',
    en: 'Paste truck tracking links — one per line. Coordinates and speed update on their own.',
  },
  'tracking.eldLinksPlaceholder': { ru: 'Ссылка на трак 1\nСсылка на трак 2', en: 'Link for truck 1\nLink for truck 2' },
  'tracking.savingUpdating': { ru: 'Сохраняю и обновляю…', en: 'Saving and updating…' },
  'tracking.saveAndUpdate': { ru: 'Сохранить и обновить', en: 'Save and update' },
  'tracking.linksSavedPrefix': { ru: 'Ссылок сохранено: ', en: 'Links saved: ' },
  'tracking.updatedTrucksMid': { ru: ', обновлено траков: ', en: ', trucks updated: ' },
  'tracking.errorsSuffix': { ru: ' · ошибки: ', en: ' · errors: ' },

  // components/refresh-fleet-button.tsx + small-refresh-button.tsx
  'tracking.autoRefreshTitle': { ru: 'Обновляется само каждые 30с', en: 'Auto-refreshes every 30s' },
  'tracking.updatedTrucksPrefix': { ru: 'Обновлено траков: ', en: 'Trucks updated: ' },
  'tracking.noNewData': { ru: 'Новых данных нет', en: 'No new data' },
  'tracking.updating': { ru: 'Обновляю…', en: 'Updating…' },
  'tracking.refresh': { ru: 'Обновить', en: 'Refresh' },
  'tracking.refreshGpsTitle': { ru: 'Обновить GPS', en: 'Refresh GPS' },

  // lib/map.ts eldStatus()
  'tracking.idleNoGpsPrefix': { ru: 'Стоит ~', en: 'Stopped ~' },
  'tracking.idleNoGpsSuffix': { ru: 'ч (нет движения по GPS)', en: 'h (no GPS movement)' },
  'tracking.movingPrefix': { ru: 'В движении · ', en: 'Moving · ' },
  'tracking.movingText': { ru: 'В движении', en: 'Moving' },

  // lib/geo-routing.ts
  'tracking.geoNoCoords': { ru: 'Не удалось определить координаты города.', en: 'Could not determine the city coordinates.' },
  'tracking.geoNoRoute': { ru: 'Не удалось построить маршрут по дорогам.', en: 'Could not build a road route.' },
  'tracking.eiaNoPrice': { ru: 'EIA не вернул цену.', en: 'EIA did not return a price.' },

  // lib/eld.ts
  'tracking.eldUnavailable': {
    ru: 'ELD недоступен — обратись к администратору',
    en: 'ELD is unavailable — contact your administrator',
  },
} as const
