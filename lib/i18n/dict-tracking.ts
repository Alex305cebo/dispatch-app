// Tracking domain: app/tracking/**, app/track/[id]/**, fleet-map/fleet-list/
// eld-links/refresh-fleet-button/small-refresh-button, lib/map.ts, lib/load-map.ts,
// lib/geo-routing.ts, lib/eld.ts.

export const trackingDict = {
  // lib/load-map.ts pin labels — shared by the truck page and the load page maps.
  'tracking.pickupPrefix': { ru: 'Пикап · ', en: 'Pickup · ', es: 'Recogida · ', uk: 'Пікап · ', ro: 'Încărcare · ', kk: 'Тиеу · ' },
  'tracking.fromPrefix': { ru: 'Из ', en: 'From ', es: 'Desde ', uk: 'Із ', ro: 'Din ', kk: 'Қайдан: ' },
  'tracking.toDelivery': { ru: ' до delivery', en: ' to delivery', es: ' hasta la entrega', uk: ' до вивантаження', ro: ' până la livrare', kk: ' түсіруге дейін' },
  'tracking.gpsAgo': { ru: 'GPS: {age} назад', en: 'GPS: {age} ago', es: 'GPS: hace {age}', uk: 'GPS: {age} тому', ro: 'GPS: acum {age}', kk: 'GPS: {age} бұрын' },
  'tracking.gpsStale': { ru: '⚠ GPS устарел — {age} назад', en: '⚠ GPS stale — {age} ago', es: '⚠ GPS desactualizado — hace {age}', uk: '⚠ GPS застарів — {age} тому', ro: '⚠ GPS învechit — acum {age}', kk: '⚠ GPS ескірді — {age} бұрын' },
  'tracking.updatedPrefix': { ru: 'обновлено ', en: 'updated ', es: 'actualizado ', uk: 'оновлено ', ro: 'actualizat ', kk: 'жаңартылды ' },
  'tracking.noSnapshotYet': { ru: 'снимков ещё не было', en: 'no snapshot yet', es: 'aún no hay capturas', uk: 'знімків ще не було', ro: 'încă nu sunt capturi', kk: 'әзірге түсірілім жоқ' },

  // Public /track/[id] share link (no login).
  'tracking.truckHash': { ru: 'Трак ', en: 'Truck ', es: 'Camión ', uk: 'Трак ', ro: 'Camion ', kk: 'Тракт ' },
  'tracking.noData': { ru: 'Нет данных', en: 'No data', es: 'Sin datos', uk: 'Немає даних', ro: 'Fără date', kk: 'Дерек жоқ' },
  'tracking.noCoordsYet': { ru: 'Координаты пока не пришли.', en: 'No coordinates yet.', es: 'Aún no llegan coordenadas.', uk: 'Координати поки не надійшли.', ro: 'Încă nu au venit coordonate.', kk: 'Координаттар әлі келген жоқ.' },

  // app/tracking/page.tsx
  'tracking.title': { ru: 'Трекинг', en: 'Tracking', es: 'Rastreo', uk: 'Трекінг', ro: 'Urmărire', kk: 'Бақылау' },
  'tracking.infoText': {
    ru: 'Живая карта парка. На карте — где сейчас каждый трак и линия по дорогам до места выгрузки. В списке — статус (в движении/off/on), последняя локация, скорость и сколько осталось ехать до выгрузки. Координаты обновляются автоматически.',
    en: 'Live fleet map. The map shows where every truck is now and the road route to its delivery point. The list below shows status (moving/off/on), last location, speed, and how far is left to delivery. Coordinates update automatically.',
    es: 'Mapa en vivo de la flota. En el mapa, dónde está cada camión y la ruta por carretera hasta la descarga. En la lista, el estado (en marcha/off/on), la última ubicación, la velocidad y cuánto falta para la entrega. Las coordenadas se actualizan solas.',
    uk: 'Жива мапа парку. На мапі — де зараз кожен трак і лінія дорогами до місця вивантаження. У списку — статус (у русі/off/on), остання локація, швидкість і скільки лишилося їхати. Координати оновлюються автоматично.',
    ro: 'Harta live a flotei. Pe hartă — unde e fiecare camion acum și traseul pe șosele până la descărcare. În listă — starea (în mers/off/on), ultima locație, viteza și cât a mai rămas până la livrare. Coordonatele se actualizează singure.',
    kk: 'Парктің тірі картасы. Картада — әр тракт қазір қайда және түсіру орнына дейінгі жол сызығы. Тізімде — күй (қозғалыста/off/on), соңғы орын, жылдамдық және түсіруге қанша қалғаны. Координаттар өздігінен жаңарады.',
  },
  'tracking.subtitle': {
    ru: 'Где траки, куда едут и сколько осталось до выгрузки — вживую.',
    en: 'Where the trucks are, where they are headed, and how far to delivery — live.',
    es: 'Dónde están los camiones, adónde van y cuánto falta para descargar — en vivo.',
    uk: 'Де траки, куди їдуть і скільки лишилося до вивантаження — наживо.',
    ro: 'Unde sunt camioanele, încotro merg și cât mai e până la descărcare — live.',
    kk: 'Тракттар қайда, қайда бара жатыр және түсіруге қанша қалды — тікелей эфирде.',
  },
  'tracking.moving': { ru: 'в движении', en: 'moving', es: 'en marcha', uk: 'у русі', ro: 'în mers', kk: 'қозғалыста' },
  'tracking.resting': { ru: 'стоят', en: 'stopped', es: 'parados', uk: 'стоять', ro: 'opriți', kk: 'тұр' },
  'tracking.noGpsBadge': { ru: 'без GPS', en: 'no GPS', es: 'sin GPS', uk: 'без GPS', ro: 'fără GPS', kk: 'GPS жоқ' },
  'tracking.fleetTotalSuffix': { ru: 'суммарно до выгрузки по парку', en: 'total fleet miles to delivery', es: 'millas totales de la flota hasta la entrega', uk: 'сумарно до вивантаження по парку', ro: 'total mile flotă până la livrare', kk: 'парк бойынша түсіруге дейін жиынтық' },
  // Tile captions sit under a big number, so they are short on purpose —
  // fleetTotalSuffix reads as a sentence and wraps to three lines in a tile.
  'tracking.tileToDelivery': { ru: 'до выгрузки', en: 'to delivery', es: 'hasta la entrega', uk: 'до вивантаження', ro: 'până la livrare', kk: 'түсіруге дейін' },
  'tracking.tileUnderLoad': { ru: 'под грузом', en: 'under load', es: 'con carga', uk: 'під вантажем', ro: 'cu marfă', kk: 'жүкпен' },
  'tracking.tileStuck': { ru: 'стоят 3 ч+', en: 'idle 3h+', es: 'parados 3 h+', uk: 'стоять 3 год+', ro: 'opriți de 3 h+', kk: '3 сағ+ тұр' },
  // Same strip, switched to one truck's own numbers after its pin is clicked.
  'tracking.tileEnRoute': { ru: 'в пути', en: 'en route', es: 'en ruta', uk: 'у дорозі', ro: 'pe drum', kk: 'жолда' },
  'tracking.tileFuel': { ru: 'топливо', en: 'fuel', es: 'combustible', uk: 'пальне', ro: 'combustibil', kk: 'жанармай' },
  'tracking.tileIdleH': { ru: 'простой, ч', en: 'idle, h', es: 'parada, h', uk: 'простій, год', ro: 'staționare, h', kk: 'тұрып қалу, сағ' },
  'tracking.wholeFleet': { ru: 'Весь парк', en: 'Whole fleet', es: 'Toda la flota', uk: 'Увесь парк', ro: 'Toată flota', kk: 'Бүкіл парк' },
  'tracking.pickOnMap': { ru: 'Нажми трак на карте — покажу его цифры', en: 'Tap a truck on the map for its numbers', es: 'Toca un camión en el mapa y te muestro sus cifras', uk: 'Натисни трак на мапі — покажу його цифри', ro: 'Atinge un camion pe hartă și îți arăt cifrele lui', kk: 'Картадан трактты басыңыз — оның сандарын көрсетемін' },
  'tracking.nextDeliveries': { ru: 'Ближайшие выгрузки', en: 'Next deliveries', es: 'Próximas entregas', uk: 'Найближчі вивантаження', ro: 'Următoarele livrări', kk: 'Жақындағы түсірулер' },
  // Button labels carry an icon now, so the emoji/arrow baked into the old strings
  // would double up. Short forms also stop "Открыть груз · Chicago, IL → Dallas, TX"
  // from wrapping to three lines and tearing the card open.
  'tracking.needAttention': { ru: 'Требуют внимания', en: 'Need attention', es: 'Requieren atención', uk: 'Потребують уваги', ro: 'Necesită atenție', kk: 'Назар аударуды қажет етеді' },
  'tracking.callShort': { ru: 'Позвонить', en: 'Call', es: 'Llamar', uk: 'Подзвонити', ro: 'Sună', kk: 'Қоңырау шалу' },
  'tracking.loadShort': { ru: 'Груз', en: 'Load', es: 'Carga', uk: 'Вантаж', ro: 'Cursă', kk: 'Жүк' },

  // components/fleet-map.tsx
  'tracking.openArrow': { ru: 'Открыть', en: 'Open', es: 'Abrir', uk: 'Відкрити', ro: 'Deschide', kk: 'Ашу' },
  'tracking.noCoordsPanel': {
    ru: 'Координат пока нет — подключи отслеживание траков в разделе «Трекинг».',
    en: 'No coordinates yet — connect truck tracking in the Tracking section.',
    es: 'Aún no hay coordenadas — conecta el rastreo de camiones en la sección «Rastreo».',
    uk: 'Координат поки немає — підключи відстеження траків у розділі «Трекінг».',
    ro: 'Încă nu sunt coordonate — conectează urmărirea camioanelor în secțiunea „Urmărire”.',
    kk: 'Координаттар әзірге жоқ — «Бақылау» бөлімінде тракттарды бақылауды қосыңыз.',
  },
  'tracking.weekShort': { ru: 'за неделю', en: 'this week', es: 'esta semana', uk: 'за тиждень', ro: 'săptămâna asta', kk: 'апта ішінде' },
  'tracking.docsShort': { ru: 'документы', en: 'documents', es: 'documentos', uk: 'документи', ro: 'documente', kk: 'құжаттар' },
  'tracking.mapExpand': { ru: 'Развернуть карту', en: 'Expand the map', es: 'Ampliar el mapa', uk: 'Розгорнути мапу', ro: 'Extinde harta', kk: 'Картаны жаю' },
  'tracking.mapCollapse': { ru: 'Свернуть карту (Esc)', en: 'Collapse the map (Esc)', es: 'Cerrar el mapa (Esc)', uk: 'Згорнути мапу (Esc)', ro: 'Restrânge harta (Esc)', kk: 'Картаны жабу (Esc)' },
  'tracking.mapLabel': { ru: '🗺 Карта', en: '🗺 Map', es: '🗺 Mapa', uk: '🗺 Мапа', ro: '🗺 Hartă', kk: '🗺 Карта' },
  'tracking.satelliteLabel': { ru: '🛰 Гибрид', en: '🛰 Hybrid', es: '🛰 Híbrido', uk: '🛰 Гібрид', ro: '🛰 Hibrid', kk: '🛰 Гибрид' },
  'tracking.legendMoving': { ru: 'едет', en: 'moving', es: 'en marcha', uk: 'їде', ro: 'merge', kk: 'жүріп келеді' },
  'tracking.legendOnDuty': { ru: 'на смене', en: 'on duty', es: 'en turno', uk: 'на зміні', ro: 'în tură', kk: 'ауысымда' },
  'tracking.legendStopped': { ru: 'стоит', en: 'stopped', es: 'parado', uk: 'стоїть', ro: 'oprit', kk: 'тұр' },

  // components/fleet-list.tsx
  'tracking.copyBtn': { ru: 'Копировать', en: 'Copy', es: 'Copiar', uk: 'Копіювати', ro: 'Copiază', kk: 'Көшіру' },
  'tracking.mapBtn': { ru: 'Карта', en: 'Map', es: 'Mapa', uk: 'Мапа', ro: 'Hartă', kk: 'Карта' },
  'tracking.copyCoordsTitle': { ru: 'Скопировать координаты — вставь в Google Maps, точка встанет ровно там, где трак', en: 'Copy coordinates — paste into Google Maps for the exact spot', es: 'Copiar coordenadas — pégalas en Google Maps y el punto cae justo donde está el camión', uk: 'Скопіювати координати — встав у Google Maps, точка стане рівно там, де трак', ro: 'Copiază coordonatele — lipește-le în Google Maps și punctul cade exact unde e camionul', kk: 'Координаттарды көшіру — Google Maps-қа қойыңыз, нүкте тракт тұрған жерге дәл түседі' },
  'tracking.openMapsTitle': { ru: 'Открыть на карте Google', en: 'Open in Google Maps', es: 'Abrir en Google Maps', uk: 'Відкрити на мапі Google', ro: 'Deschide în Google Maps', kk: 'Google картасынан ашу' },
  'tracking.addressCopiedPrefix': { ru: 'Адрес скопирован: ', en: 'Address copied: ', es: 'Dirección copiada: ', uk: 'Адресу скопійовано: ', ro: 'Adresă copiată: ', kk: 'Мекенжай көшірілді: ' },
  'tracking.clipboardDenied': {
    ru: 'Браузер не дал буфер — выдели адрес вручную',
    en: 'Browser denied clipboard access — select the address manually',
    es: 'El navegador no dio acceso al portapapeles — selecciona la dirección a mano',
    uk: 'Браузер не дав буфер — виділи адресу вручну',
    ro: 'Browserul nu a permis clipboardul — selectează adresa manual',
    kk: 'Браузер буферді бермеді — мекенжайды қолмен белгілеңіз',
  },
  'tracking.copyLocationTitle': { ru: 'Скопировать адрес местоположения трака', en: 'Copy truck location address', es: 'Copiar la dirección de la ubicación del camión', uk: 'Скопіювати адресу розташування трака', ro: 'Copiază adresa locației camionului', kk: 'Тракттың орналасқан мекенжайын көшіру' },
  'tracking.noEldData': { ru: 'Нет данных с ELD', en: 'No data from ELD', es: 'Sin datos del ELD', uk: 'Немає даних з ELD', ro: 'Fără date de la ELD', kk: 'ELD дерегі жоқ' },
  'tracking.repairLabel': { ru: '🔧 В ремонте', en: '🔧 In repair', es: '🔧 En el taller', uk: '🔧 У ремонті', ro: '🔧 În service', kk: '🔧 Жөндеуде' },
  'tracking.vacationLabel': { ru: '🌴 Отпуск', en: '🌴 Vacation', es: '🌴 Vacaciones', uk: '🌴 Відпустка', ro: '🌴 Concediu', kk: '🌴 Демалыс' },
  'tracking.fuelTitle': { ru: 'Уровень топлива по датчику трака', en: 'Tank level from the truck sensor', es: 'Nivel del tanque según el sensor del camión', uk: 'Рівень пального за датчиком трака', ro: 'Nivelul rezervorului după senzorul camionului', kk: 'Тракт датчигі бойынша жанармай деңгейі' },
  'tracking.idlePrefix': { ru: '⏸ стоит на месте ~', en: '⏸ stopped ~', es: '⏸ parado ~', uk: '⏸ стоїть на місці ~', ro: '⏸ oprit ~', kk: '⏸ орнында тұр ~' },
  'tracking.idleSuffix': { ru: 'ч — груз в пути', en: 'h — load in transit', es: 'h — carga en tránsito', uk: 'год — вантаж у дорозі', ro: 'h — marfa în tranzit', kk: 'сағ — жүк жолда' },
  'tracking.apptAllDay': { ru: 'окно: весь день (FCFS)', en: 'window: all day (FCFS)', es: 'ventana: todo el día (FCFS)', uk: 'вікно: весь день (FCFS)', ro: 'fereastră: toată ziua (FCFS)', kk: 'терезе: күні бойы (FCFS)' },
  'tracking.apptWindow': { ru: 'окно {a}–{b}', en: 'window {a}–{b}', es: 'ventana {a}–{b}', uk: 'вікно {a}–{b}', ro: 'fereastră {a}–{b}', kk: 'терезе {a}–{b}' },
  'tracking.apptBy': { ru: 'к {t}', en: 'by {t}', es: 'a las {t}', uk: 'до {t}', ro: 'până la {t}', kk: '{t}-ге дейін' },
  'tracking.fitAll': { ru: 'Показать весь маршрут и трак', en: 'Fit the whole route and truck', es: 'Encuadrar ruta y camión', uk: 'Показати весь маршрут і трак', ro: 'Încadrează ruta și camionul', kk: 'Бүкіл маршрут пен тракты көрсету' },
  'tracking.trailLabel': { ru: 'След 12ч', en: 'Trail 12h', es: 'Rastro 12h', uk: 'Слід 12г', ro: 'Urmă 12h', kk: 'Із 12с' },
  'tracking.trailTitle': { ru: 'Янтарные точки — GPS-отметки, где трак был последние 12 часов', en: 'Amber dots — GPS pings from the last 12 hours', es: 'Puntos ámbar: posiciones GPS de las últimas 12 horas', uk: 'Янтарні точки — GPS-відмітки за останні 12 годин', ro: 'Puncte chihlimbar — poziții GPS din ultimele 12 ore', kk: 'Янтарь нүктелер — соңғы 12 сағаттағы GPS белгілері' },
  'tracking.toDeliveryLabel': { ru: 'До выгрузки · ', en: 'To delivery · ', es: 'Hasta la entrega · ', uk: 'До вивантаження · ', ro: 'Până la livrare · ', kk: 'Түсіруге дейін · ' },
  'tracking.noActiveLoad': { ru: 'Нет активного груза', en: 'No active load', es: 'Sin carga activa', uk: 'Немає активного вантажу', ro: 'Fără cursă activă', kk: 'Белсенді жүк жоқ' },
  'tracking.call': { ru: '📞 Позвонить', en: '📞 Call', es: '📞 Llamar', uk: '📞 Подзвонити', ro: '📞 Sună', kk: '📞 Қоңырау шалу' },
  'tracking.openLoad': { ru: 'Открыть груз', en: 'Open load', es: 'Abrir la carga', uk: 'Відкрити вантаж', ro: 'Deschide cursa', kk: 'Жүкті ашу' },
  'tracking.tripHistory': { ru: 'История пути →', en: 'Trip history →', es: 'Historial del viaje →', uk: 'Історія шляху →', ro: 'Istoricul cursei →', kk: 'Жол тарихы →' },
  'tracking.allTrucksBusy': { ru: 'Все траки сейчас в работе.', en: 'All trucks are on a load right now.', es: 'Ahora mismo todos los camiones llevan carga.', uk: 'Усі траки зараз у роботі.', ro: 'Toate camioanele au acum cursă.', kk: 'Барлық тракттар қазір жұмыста.' },
  'tracking.freeTrucks': { ru: 'Свободные траки', en: 'Free trucks', es: 'Camiones libres', uk: 'Вільні траки', ro: 'Camioane libere', kk: 'Бос тракттар' },

  // components/eld-links.tsx
  'tracking.trackingHeader': { ru: 'Отслеживание траков', en: 'Truck tracking', es: 'Rastreo de camiones', uk: 'Відстеження траків', ro: 'Urmărirea camioanelor', kk: 'Тракттарды бақылау' },
  'tracking.connectedSuffix': { ru: '· подключено ', en: '· connected ', es: '· conectados ', uk: '· підключено ', ro: '· conectate ', kk: '· қосылған ' },
  'tracking.eldLinksInfo': {
    ru: 'Вставь ссылки отслеживания траков — по одной на строку. Координаты и скорость обновляются сами.',
    en: 'Paste truck tracking links — one per line. Coordinates and speed update on their own.',
    es: 'Pega los enlaces de rastreo de los camiones — uno por línea. Las coordenadas y la velocidad se actualizan solas.',
    uk: 'Встав посилання відстеження траків — по одному на рядок. Координати і швидкість оновлюються самі.',
    ro: 'Lipește linkurile de urmărire ale camioanelor — câte unul pe rând. Coordonatele și viteza se actualizează singure.',
    kk: 'Тракттарды бақылау сілтемелерін қойыңыз — әр жолға біреуден. Координаттар мен жылдамдық өздігінен жаңарады.',
  },
  'tracking.eldLinksPlaceholder': { ru: 'Ссылка на трак 1\nСсылка на трак 2', en: 'Link for truck 1\nLink for truck 2', es: 'Enlace del camión 1\nEnlace del camión 2', uk: 'Посилання на трак 1\nПосилання на трак 2', ro: 'Link pentru camionul 1\nLink pentru camionul 2', kk: '1-тракттың сілтемесі\n2-тракттың сілтемесі' },
  'tracking.savingUpdating': { ru: 'Сохраняю и обновляю…', en: 'Saving and updating…', es: 'Guardando y actualizando…', uk: 'Зберігаю й оновлюю…', ro: 'Se salvează și se actualizează…', kk: 'Сақталып, жаңартылуда…' },
  'tracking.saveAndUpdate': { ru: 'Сохранить и обновить', en: 'Save and update', es: 'Guardar y actualizar', uk: 'Зберегти й оновити', ro: 'Salvează și actualizează', kk: 'Сақтап, жаңарту' },
  'tracking.linksSavedPrefix': { ru: 'Ссылок сохранено: ', en: 'Links saved: ', es: 'Enlaces guardados: ', uk: 'Посилань збережено: ', ro: 'Linkuri salvate: ', kk: 'Сақталған сілтемелер: ' },
  'tracking.updatedTrucksMid': { ru: ', обновлено траков: ', en: ', trucks updated: ', es: ', camiones actualizados: ', uk: ', оновлено траків: ', ro: ', camioane actualizate: ', kk: ', жаңартылған тракттар: ' },
  'tracking.errorsSuffix': { ru: ' · ошибки: ', en: ' · errors: ', es: ' · errores: ', uk: ' · помилки: ', ro: ' · erori: ', kk: ' · қателер: ' },

  // components/refresh-fleet-button.tsx + small-refresh-button.tsx
  'tracking.autoRefreshTitle': { ru: 'Обновляется само каждые 30с', en: 'Auto-refreshes every 30s', es: 'Se actualiza solo cada 30 s', uk: 'Оновлюється саме кожні 30 с', ro: 'Se actualizează singur la 30 s', kk: 'Әр 30 сек сайын өздігінен жаңарады' },
  'tracking.updatedTrucksPrefix': { ru: 'Обновлено траков: ', en: 'Trucks updated: ', es: 'Camiones actualizados: ', uk: 'Оновлено траків: ', ro: 'Camioane actualizate: ', kk: 'Жаңартылған тракттар: ' },
  'tracking.noNewData': { ru: 'Новых данных нет', en: 'No new data', es: 'No hay datos nuevos', uk: 'Нових даних немає', ro: 'Nu sunt date noi', kk: 'Жаңа дерек жоқ' },
  'tracking.updating': { ru: 'Обновляю…', en: 'Updating…', es: 'Actualizando…', uk: 'Оновлюю…', ro: 'Se actualizează…', kk: 'Жаңартылуда…' },
  'tracking.refresh': { ru: 'Обновить', en: 'Refresh', es: 'Actualizar', uk: 'Оновити', ro: 'Actualizează', kk: 'Жаңарту' },
  'tracking.refreshGpsTitle': { ru: 'Обновить GPS', en: 'Refresh GPS', es: 'Actualizar el GPS', uk: 'Оновити GPS', ro: 'Actualizează GPS-ul', kk: 'GPS-ті жаңарту' },

  // lib/map.ts eldStatus()
  'tracking.idleNoGpsPrefix': { ru: 'Стоит ~', en: 'Stopped ~', es: 'Parado ~', uk: 'Стоїть ~', ro: 'Oprit ~', kk: 'Тұр ~' },
  'tracking.idleNoGpsSuffix': { ru: 'ч (нет движения по GPS)', en: 'h (no GPS movement)', es: 'h (sin movimiento por GPS)', uk: 'год (немає руху за GPS)', ro: 'h (fără mișcare pe GPS)', kk: 'сағ (GPS бойынша қозғалыс жоқ)' },
  'tracking.movingPrefix': { ru: 'В движении · ', en: 'Moving · ', es: 'En marcha · ', uk: 'У русі · ', ro: 'În mers · ', kk: 'Қозғалыста · ' },
  'tracking.movingText': { ru: 'В движении', en: 'Moving', es: 'En marcha', uk: 'У русі', ro: 'În mers', kk: 'Қозғалыста' },

  // lib/geo-routing.ts
  'tracking.geoNoCoords': { ru: 'Не удалось определить координаты города.', en: 'Could not determine the city coordinates.', es: 'No se pudieron determinar las coordenadas de la ciudad.', uk: 'Не вдалося визначити координати міста.', ro: 'Nu s-au putut determina coordonatele orașului.', kk: 'Қаланың координаттарын анықтау мүмкін болмады.' },
  'tracking.geoNoRoute': { ru: 'Не удалось построить маршрут по дорогам.', en: 'Could not build a road route.', es: 'No se pudo trazar una ruta por carretera.', uk: 'Не вдалося побудувати маршрут дорогами.', ro: 'Nu s-a putut construi un traseu pe șosele.', kk: 'Жолдармен маршрут құру мүмкін болмады.' },
  'tracking.eiaNoPrice': { ru: 'EIA не вернул цену.', en: 'EIA did not return a price.', es: 'EIA no devolvió un precio.', uk: 'EIA не повернув ціну.', ro: 'EIA nu a returnat un preț.', kk: 'EIA бағаны қайтармады.' },

  // lib/eld.ts
  'tracking.eldUnavailable': {
    ru: 'ELD недоступен — обратись к администратору',
    en: 'ELD is unavailable — contact your administrator',
    es: 'El ELD no está disponible — avisa al administrador',
    uk: 'ELD недоступний — зверніться до адміністратора',
    ro: 'ELD-ul nu e disponibil — contactează administratorul',
    kk: 'ELD қолжетімсіз — әкімшіге хабарласыңыз',
  },
} as const
