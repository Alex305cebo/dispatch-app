// Documents domain: app/docs/**, docs.tsx, doc-viewer.tsx, lib/docs.ts.

export const docsDict = {
  'docs.kind.changeTitle': { ru: 'Изменить тип файла', en: 'Change file type', es: 'Cambiar tipo de archivo', uk: 'Змінити тип файлу', ro: 'Schimbă tipul fișierului', kk: 'Файл түрін өзгерту' },
  'docs.kind.changed': { ru: 'Тип файла изменён', en: 'File type changed', es: 'Tipo de archivo cambiado', uk: 'Тип файлу змінено', ro: 'Tipul fișierului a fost schimbat', kk: 'Файл түрі өзгертілді' },
  'docs.unattached.recognize': { ru: 'Распознать → груз', en: 'Recognise → load', es: 'Leer → carga', uk: 'Розпізнати → вантаж', ro: 'Citește → cursă', kk: 'Тану → жүк' },
  'docs.unattached.working': { ru: 'Читаю…', en: 'Reading…', es: 'Leyendo…', uk: 'Читаю…', ro: 'Se citește…', kk: 'Оқып жатырмын…' },
  'docs.unattached.attachTo': { ru: 'Прикрепить к грузу…', en: 'Attach to load…', es: 'Adjuntar a una carga…', uk: 'Прикріпити до вантажу…', ro: 'Atașează la o cursă…', kk: 'Жүкке тіркеу…' },
  'docs.unattached.recognizedToast': { ru: 'Груз создан из rate con', en: 'Load created from the rate con', es: 'Carga creada del rate con', uk: 'Вантаж створено з rate con', ro: 'Cursă creată din rate con', kk: 'Rate con-нан жүк құрылды' },
  'docs.unattached.attachedToast': { ru: 'Файл прикреплён к грузу', en: 'File attached to the load', es: 'Archivo adjuntado a la carga', uk: 'Файл прикріплено до вантажу', ro: 'Fișier atașat la cursă', kk: 'Файл жүкке тіркелді' },
  // app/docs/page.tsx
  'docs.title': { ru: 'Документы', en: 'Documents', es: 'Documentos', uk: 'Документи', ro: 'Documente', kk: 'Құжаттар' },
  'docs.info': {
    ru: 'Единая библиотека всех бумаг: rate con, BOL, POD, страховки, регистрации, инвойсы. Сгруппированы по тракам и водителям, свежие сверху, с фильтром по типу. Rate con можно распознать и сразу создать груз кнопкой сверху. Удаление под именем и PIN перемещает в корзину — насовсем только оттуда, запись остаётся в Журнале.',
    en: 'A single library for every document: rate con, BOL, POD, insurance, registration, invoices. Grouped by truck and driver, most recent first, with a filter by type. A rate con can be recognized and turned straight into a load with the button above. Deleting moves it to Trash — permanent deletion only happens from there, and the record stays in the Log.',
    es: 'Una única biblioteca de todos los papeles: rate con, BOL, POD, seguros, registros, facturas. Agrupados por camión y conductor, los nuevos arriba, con filtro por tipo. Un rate con se puede leer y crear la carga al momento con el botón de arriba. Borrar con nombre y PIN lo manda a la papelera — definitivo solo desde allí, y el registro queda en el Log.',
    uk: 'Єдина бібліотека всіх паперів: rate con, BOL, POD, страховки, реєстрації, інвойси. Згруповані за траками і водіями, свіжі зверху, з фільтром за типом. Rate con можна розпізнати і одразу створити вантаж кнопкою зверху. Видалення під іменем і PIN переміщує в кошик — назавжди тільки звідти, запис лишається в Журналі.',
    ro: 'O singură bibliotecă pentru toate hârtiile: rate con, BOL, POD, asigurări, înmatriculări, facturi. Grupate pe camioane și șoferi, cele noi sus, cu filtru pe tip. Un rate con poate fi citit și transformat imediat în cursă cu butonul de sus. Ștergerea cu nume și PIN mută în coș — definitiv doar de acolo, iar înregistrarea rămâne în Jurnal.',
    kk: 'Барлық қағаздардың біртұтас кітапханасы: rate con, BOL, POD, сақтандырулар, тіркеулер, инвойстар. Тракттар мен жүргізушілер бойынша топталған, жаңасы жоғарыда, түрі бойынша сүзгімен. Rate con-ды танып, жоғарыдағы түймемен бірден жүк құруға болады. Атпен және PIN-мен жою себетке жібереді — біржола тек содан, ал жазба Журналда қалады.',
  },
  'docs.subtitle': {
    ru: 'Все бумаги в одном месте — по водителям и датам, как в библиотеке.',
    en: 'All your paperwork in one place — by driver and date, like a library.',
    es: 'Todo el papeleo en un sitio — por conductor y fecha, como en una biblioteca.',
    uk: 'Усі папери в одному місці — за водіями і датами, як у бібліотеці.',
    ro: 'Toate hârtiile într-un loc — după șofer și dată, ca într-o bibliotecă.',
    kk: 'Барлық қағаз бір жерде — жүргізушілер мен күндер бойынша, кітапханадағыдай.',
  },
  'docs.recognize.title': { ru: 'Распознать rate con', en: 'Recognize a rate con', es: 'Leer un rate con', uk: 'Розпізнати rate con', ro: 'Citește un rate con', kk: 'Rate con тану' },
  'docs.recognize.sub': {
    ru: 'Перетащи PDF или фото — ИИ прочитает и сразу создаст груз',
    en: 'Drop a PDF or photo — AI reads it and creates the load instantly',
    es: 'Arrastra un PDF o foto — la IA lo lee y crea la carga al instante',
    uk: 'Перетягни PDF або фото — ШІ прочитає і одразу створить вантаж',
    ro: 'Trage un PDF sau o poză — IA citește și creează imediat cursa',
    kk: 'PDF немесе суретті сүйреңіз — ЖИ оқып, бірден жүк құрады',
  },
  'docs.tab.library': { ru: 'Библиотека', en: 'Library', es: 'Biblioteca', uk: 'Бібліотека', ro: 'Bibliotecă', kk: 'Кітапхана' },
  'docs.tab.trash': { ru: 'Корзина', en: 'Trash', es: 'Papelera', uk: 'Кошик', ro: 'Coș de gunoi', kk: 'Себет' },

  // components/docs.tsx — DocUpload
  'docs.upload.saved': { ru: 'Документ сохранён', en: 'Document saved', es: 'Documento guardado', uk: 'Документ збережено', ro: 'Document salvat', kk: 'Құжат сақталды' },
  'docs.upload.noTruck': { ru: 'Без трака', en: 'No truck', es: 'Sin camión', uk: 'Без трака', ro: 'Fără camion', kk: 'Трактсыз' },
  'docs.upload.uploading': { ru: 'Загружаю…', en: 'Uploading…', es: 'Subiendo…', uk: 'Завантажую…', ro: 'Se încarcă…', kk: 'Жүктелуде…' },
  'docs.upload.file': { ru: '+ Файл', en: '+ File', es: '+ Archivo', uk: '+ Файл', ro: '+ Fișier', kk: '+ Файл' },
  'docs.upload.hint': { ru: 'PDF или фото, до 8 МБ', en: 'PDF or photo, up to 8MB', es: 'PDF o foto, hasta 8 MB', uk: 'PDF або фото, до 8 МБ', ro: 'PDF sau poză, până la 8 MB', kk: 'PDF немесе сурет, 8 МБ дейін' },
  'docs.upload.info': {
    ru: 'Выбери тип документа (Rate con / BOL / POD / инвойс / страховка / регистрация), при загрузке в общий раздел — трак, и добавь файл. Хранится в базе, привязан к грузу или траку, скачивается по клику.',
    en: 'Choose the document type (Rate con / BOL / POD / invoice / insurance / registration), pick a truck when uploading from the shared section, and add the file. Stored in the database, linked to the load or truck, downloads on click.',
    es: 'Elige el tipo de documento (rate con / BOL / POD / factura / seguro / registro), y al subirlo en la sección común, el camión; después añade el archivo. Se guarda en la base, queda ligado a la carga o al camión y se descarga con un clic.',
    uk: 'Обери тип документа (Rate con / BOL / POD / інвойс / страховка / реєстрація), при завантаженні в загальний розділ — трак, і додай файл. Зберігається в базі, прив\'язаний до вантажу або трака, завантажується по кліку.',
    ro: 'Alege tipul documentului (rate con / BOL / POD / factură / asigurare / înmatriculare), iar la încărcarea în secțiunea comună — camionul, apoi adaugă fișierul. Se păstrează în bază, e legat de cursă sau de camion și se descarcă cu un clic.',
    kk: 'Құжат түрін таңдаңыз (Rate con / BOL / POD / инвойс / сақтандыру / тіркеу), жалпы бөлімге жүктегенде — трактты, содан соң файлды қосыңыз. Базада сақталады, жүкке немесе трактқа байланады, бір басумен жүктеледі.',
  },

  // DeleteDialog
  'docs.delete.title': { ru: 'Удалить документ', en: 'Delete document', es: 'Eliminar documento', uk: 'Видалити документ', ro: 'Șterge documentul', kk: 'Құжатты жою' },
  'docs.delete.body': {
    ru: '«{t}» переместится в корзину — насовсем удаляется только оттуда. Напечатай DELETE заглавными, чтобы подтвердить. Запись, кто удалил, останется в Журнале.',
    en: '"{t}" will move to Trash — it is only permanently deleted from there. Type DELETE in capitals to confirm. The record of who deleted it stays in the Log.',
    es: '«{t}» irá a la papelera — se borra del todo solo desde allí. Escribe DELETE en mayúsculas para confirmar. Quién lo borró queda anotado en el Log.',
    uk: '«{t}» переміститься в кошик — назавжди видаляється лише звідти. Надрукуй DELETE великими, щоб підтвердити. Запис, хто видалив, залишиться в Журналі.',
    ro: '„{t}” va merge în coș — se șterge definitiv doar de acolo. Scrie DELETE cu majuscule ca să confirmi. Cine a șters rămâne notat în Jurnal.',
    kk: '«{t}» себетке жылжиды — біржола тек содан жойылады. Растау үшін DELETE деп бас әріппен теріңіз. Кім жойғаны Журналда қалады.',
  },
  'docs.delete.cancel': { ru: 'Отмена', en: 'Cancel', es: 'Cancelar', uk: 'Скасувати', ro: 'Anulează', kk: 'Болдырмау' },
  'docs.delete.deleting': { ru: 'Удаляю…', en: 'Deleting…', es: 'Eliminando…', uk: 'Видаляю…', ro: 'Se șterge…', kk: 'Жойылуда…' },
  'docs.delete.confirm': { ru: 'Удалить', en: 'Delete', es: 'Eliminar', uk: 'Видалити', ro: 'Șterge', kk: 'Жою' },
  'docs.delete.done': { ru: 'Документ удалён', en: 'Document deleted', es: 'Documento eliminado', uk: 'Документ видалено', ro: 'Document șters', kk: 'Құжат жойылды' },
  'docs.delete.rowTitle': { ru: 'Удалить', en: 'Delete', es: 'Eliminar', uk: 'Видалити', ro: 'Șterge', kk: 'Жою' },

  // DocRow
  'docs.row.truck': { ru: 'трак', en: 'truck', es: 'camión', uk: 'трак', ro: 'camion', kk: 'тракт' },
  'docs.row.load': { ru: 'груз', en: 'load', es: 'carga', uk: 'вантаж', ro: 'cursă', kk: 'жүк' },

  // DocList / DocLibrary
  'docs.list.empty': { ru: 'Документов пока нет.', en: 'No documents yet.', es: 'Aún no hay documentos.', uk: 'Документів поки немає.', ro: 'Încă nu sunt documente.', kk: 'Әзірге құжат жоқ.' },
  'docs.library.more': { ru: 'ещё {n}', en: '{n} more', es: '{n} más', uk: 'ще {n}', ro: 'încă {n}', kk: 'тағы {n}' },
  'docs.library.all': { ru: 'Все', en: 'All', es: 'Todos', uk: 'Усі', ro: 'Toate', kk: 'Барлығы' },
  'docs.library.empty': { ru: 'Ничего не найдено.', en: 'Nothing found.', es: 'No se encontró nada.', uk: 'Нічого не знайдено.', ro: 'Nu s-a găsit nimic.', kk: 'Ештеңе табылмады.' },

  // DocTrash
  'docs.trash.restored': { ru: 'Восстановлено', en: 'Restored', es: 'Restaurado', uk: 'Відновлено', ro: 'Restaurat', kk: 'Қалпына келтірілді' },
  'docs.trash.empty': { ru: 'Корзина пуста.', en: 'Trash is empty.', es: 'La papelera está vacía.', uk: 'Кошик порожній.', ro: 'Coșul este gol.', kk: 'Себет бос.' },
  'docs.trash.deletedOn': { ru: 'удалено {d}', en: 'deleted {d}', es: 'eliminado {d}', uk: 'видалено {d}', ro: 'șters {d}', kk: 'жойылды {d}' },
  'docs.trash.restore': { ru: 'Восстановить', en: 'Restore', es: 'Restaurar', uk: 'Відновити', ro: 'Restaurează', kk: 'Қалпына келтіру' },
  'docs.trash.purgeNote': {
    ru: 'удалится навсегда — без возможности восстановить.',
    en: 'will be permanently deleted — cannot be undone.',
    es: 'se eliminará para siempre — sin posibilidad de recuperarlo.',
    uk: 'видалиться назавжди — без можливості відновити.',
    ro: 'va fi șters definitiv — fără posibilitate de recuperare.',
    kk: 'біржола жойылады — қалпына келтіру мүмкіндігінсіз.',
  },

  // lib/docs.ts — DOC_KINDS labels, looked up via docKindLabel()
  'docs.kind.ratecon': { ru: 'Rate con', en: 'Rate con', es: 'Rate con', uk: 'Rate con', ro: 'Rate con', kk: 'Rate con' },
  'docs.kind.driverinfo': { ru: 'Driver Info', en: 'Driver Info', es: 'Driver Info', uk: 'Driver Info', ro: 'Driver Info', kk: 'Driver Info' },
  'docs.kind.bol': { ru: 'BOL', en: 'BOL', es: 'BOL', uk: 'BOL', ro: 'BOL', kk: 'BOL' },
  'docs.kind.pod': { ru: 'POD', en: 'POD', es: 'POD', uk: 'POD', ro: 'POD', kk: 'POD' },
  'docs.kind.invoice': { ru: 'Инвойс', en: 'Invoice', es: 'Factura', uk: 'Інвойс', ro: 'Factură', kk: 'Инвойс' },
  'docs.kind.insurance': { ru: 'Страховка', en: 'Insurance', es: 'Seguro', uk: 'Страховка', ro: 'Asigurare', kk: 'Сақтандыру' },
  'docs.kind.registration': { ru: 'Регистрация', en: 'Registration', es: 'Registro', uk: 'Реєстрація', ro: 'Înmatriculare', kk: 'Тіркеу' },
  'docs.kind.repair': { ru: 'Чек за ремонт', en: 'Repair receipt', es: 'Recibo de taller', uk: 'Чек за ремонт', ro: 'Bon de service', kk: 'Жөндеу чегі' },
  'docs.kind.photo': { ru: 'Фото груза', en: 'Cargo photo', es: 'Foto de la carga', uk: 'Фото вантажу', ro: 'Poză marfă', kk: 'Жүк фотосы' },
  'docs.kind.other': { ru: 'Другое', en: 'Other', es: 'Otro', uk: 'Інше', ro: 'Altul', kk: 'Басқа' },

  // components/doc-viewer.tsx
  'docs.viewer.zoomIn': { ru: 'Увеличить', en: 'Zoom in', es: 'Ampliar', uk: 'Збільшити', ro: 'Mărește', kk: 'Ұлғайту' },
  'docs.viewer.zoomOut': { ru: 'Уменьшить', en: 'Zoom out', es: 'Reducir', uk: 'Зменшити', ro: 'Micșorează', kk: 'Кішірейту' },
  'docs.viewer.opening': { ru: 'Открываю документ…', en: 'Opening document…', es: 'Abriendo el documento…', uk: 'Відкриваю документ…', ro: 'Se deschide documentul…', kk: 'Құжат ашылуда…' },
  'docs.viewer.failed': { ru: 'Не удалось показать документ', en: 'Could not display the document', es: 'No se pudo mostrar el documento', uk: 'Не вдалося показати документ', ro: 'Documentul nu a putut fi afișat', kk: 'Құжатты көрсету мүмкін болмады' },
  'docs.viewer.download': { ru: 'Скачать файл', en: 'Download file', es: 'Descargar el archivo', uk: 'Завантажити файл', ro: 'Descarcă fișierul', kk: 'Файлды жүктеу' },
  'docs.viewer.alt': { ru: 'Документ', en: 'Document', es: 'Documento', uk: 'Документ', ro: 'Document', kk: 'Құжат' },
} as const
