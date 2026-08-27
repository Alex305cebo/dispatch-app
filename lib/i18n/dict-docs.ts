// Documents domain: app/docs/**, docs.tsx, doc-viewer.tsx, lib/docs.ts.

export const docsDict = {
  'docs.unattached.recognize': { ru: 'Распознать → груз', en: 'Recognise → load', es: 'Leer → carga', uk: 'Розпізнати → вантаж', ro: 'Citește → cursă' },
  'docs.unattached.working': { ru: 'Читаю…', en: 'Reading…', es: 'Leyendo…', uk: 'Читаю…', ro: 'Se citește…' },
  'docs.unattached.attachTo': { ru: 'Прикрепить к грузу…', en: 'Attach to load…', es: 'Adjuntar a una carga…', uk: 'Прикріпити до вантажу…', ro: 'Atașează la o cursă…' },
  'docs.unattached.recognizedToast': { ru: 'Груз создан из rate con', en: 'Load created from the rate con', es: 'Carga creada del rate con', uk: 'Вантаж створено з rate con', ro: 'Cursă creată din rate con' },
  'docs.unattached.attachedToast': { ru: 'Файл прикреплён к грузу', en: 'File attached to the load', es: 'Archivo adjuntado a la carga', uk: 'Файл прикріплено до вантажу', ro: 'Fișier atașat la cursă' },
  // app/docs/page.tsx
  'docs.title': { ru: 'Документы', en: 'Documents', es: 'Documentos', uk: 'Документи', ro: 'Documente' },
  'docs.info': {
    ru: 'Единая библиотека всех бумаг: rate con, BOL, POD, страховки, регистрации, инвойсы. Сгруппированы по тракам и водителям, свежие сверху, с фильтром по типу. Rate con можно распознать и сразу создать груз кнопкой сверху. Удаление под именем и PIN перемещает в корзину — насовсем только оттуда, запись остаётся в Журнале.',
    en: 'A single library for every document: rate con, BOL, POD, insurance, registration, invoices. Grouped by truck and driver, most recent first, with a filter by type. A rate con can be recognized and turned straight into a load with the button above. Deleting moves it to Trash — permanent deletion only happens from there, and the record stays in the Log.',
  },
  'docs.subtitle': {
    ru: 'Все бумаги в одном месте — по водителям и датам, как в библиотеке.',
    en: 'All your paperwork in one place — by driver and date, like a library.',
    es: 'Todo el papeleo en un sitio — por conductor y fecha, como en una biblioteca.',
    uk: 'Усі папери в одному місці — за водіями і датами, як у бібліотеці.',
    ro: 'Toate hârtiile într-un loc — după șofer și dată, ca într-o bibliotecă.',
  },
  'docs.recognize.title': { ru: 'Распознать rate con', en: 'Recognize a rate con', es: 'Leer un rate con', uk: 'Розпізнати rate con', ro: 'Citește un rate con' },
  'docs.recognize.sub': {
    ru: 'Перетащи PDF или фото — ИИ прочитает и сразу создаст груз',
    en: 'Drop a PDF or photo — AI reads it and creates the load instantly',
    es: 'Arrastra un PDF o foto — la IA lo lee y crea la carga al instante',
    uk: 'Перетягни PDF або фото — ШІ прочитає і одразу створить вантаж',
    ro: 'Trage un PDF sau o poză — IA citește și creează imediat cursa',
  },
  'docs.tab.library': { ru: 'Библиотека', en: 'Library', es: 'Biblioteca', uk: 'Бібліотека', ro: 'Bibliotecă' },
  'docs.tab.trash': { ru: 'Корзина', en: 'Trash', es: 'Papelera', uk: 'Кошик', ro: 'Coș de gunoi' },

  // components/docs.tsx — DocUpload
  'docs.upload.saved': { ru: 'Документ сохранён', en: 'Document saved', es: 'Documento guardado', uk: 'Документ збережено', ro: 'Document salvat' },
  'docs.upload.noTruck': { ru: 'Без трака', en: 'No truck', es: 'Sin camión', uk: 'Без трака', ro: 'Fără camion' },
  'docs.upload.uploading': { ru: 'Загружаю…', en: 'Uploading…', es: 'Subiendo…', uk: 'Завантажую…', ro: 'Se încarcă…' },
  'docs.upload.file': { ru: '+ Файл', en: '+ File', es: '+ Archivo', uk: '+ Файл', ro: '+ Fișier' },
  'docs.upload.hint': { ru: 'PDF или фото, до 8 МБ', en: 'PDF or photo, up to 8MB', es: 'PDF o foto, hasta 8 MB', uk: 'PDF або фото, до 8 МБ', ro: 'PDF sau poză, până la 8 MB' },
  'docs.upload.info': {
    ru: 'Выбери тип документа (Rate con / BOL / POD / инвойс / страховка / регистрация), при загрузке в общий раздел — трак, и добавь файл. Хранится в базе, привязан к грузу или траку, скачивается по клику.',
    en: 'Choose the document type (Rate con / BOL / POD / invoice / insurance / registration), pick a truck when uploading from the shared section, and add the file. Stored in the database, linked to the load or truck, downloads on click.',
  },

  // DeleteDialog
  'docs.delete.title': { ru: 'Удалить документ', en: 'Delete document', es: 'Eliminar documento', uk: 'Видалити документ', ro: 'Șterge documentul' },
  'docs.delete.body': {
    ru: '«{t}» переместится в корзину — насовсем удаляется только оттуда. Напечатай DELETE заглавными, чтобы подтвердить. Запись, кто удалил, останется в Журнале.',
    en: '"{t}" will move to Trash — it is only permanently deleted from there. Type DELETE in capitals to confirm. The record of who deleted it stays in the Log.',
  },
  'docs.delete.cancel': { ru: 'Отмена', en: 'Cancel', es: 'Cancelar', uk: 'Скасувати', ro: 'Anulează' },
  'docs.delete.deleting': { ru: 'Удаляю…', en: 'Deleting…', es: 'Eliminando…', uk: 'Видаляю…', ro: 'Se șterge…' },
  'docs.delete.confirm': { ru: 'Удалить', en: 'Delete', es: 'Eliminar', uk: 'Видалити', ro: 'Șterge' },
  'docs.delete.done': { ru: 'Документ удалён', en: 'Document deleted', es: 'Documento eliminado', uk: 'Документ видалено', ro: 'Document șters' },
  'docs.delete.rowTitle': { ru: 'Удалить', en: 'Delete', es: 'Eliminar', uk: 'Видалити', ro: 'Șterge' },

  // DocRow
  'docs.row.truck': { ru: 'трак', en: 'truck', es: 'camión', uk: 'трак', ro: 'camion' },
  'docs.row.load': { ru: 'груз', en: 'load', es: 'carga', uk: 'вантаж', ro: 'cursă' },

  // DocList / DocLibrary
  'docs.list.empty': { ru: 'Документов пока нет.', en: 'No documents yet.', es: 'Aún no hay documentos.', uk: 'Документів поки немає.', ro: 'Încă nu sunt documente.' },
  'docs.library.more': { ru: 'ещё {n}', en: '{n} more', es: '{n} más', uk: 'ще {n}', ro: 'încă {n}' },
  'docs.library.all': { ru: 'Все', en: 'All', es: 'Todos', uk: 'Усі', ro: 'Toate' },
  'docs.library.empty': { ru: 'Ничего не найдено.', en: 'Nothing found.', es: 'No se encontró nada.', uk: 'Нічого не знайдено.', ro: 'Nu s-a găsit nimic.' },

  // DocTrash
  'docs.trash.restored': { ru: 'Восстановлено', en: 'Restored', es: 'Restaurado', uk: 'Відновлено', ro: 'Restaurat' },
  'docs.trash.empty': { ru: 'Корзина пуста.', en: 'Trash is empty.', es: 'La papelera está vacía.', uk: 'Кошик порожній.', ro: 'Coșul este gol.' },
  'docs.trash.deletedOn': { ru: 'удалено {d}', en: 'deleted {d}', es: 'eliminado {d}', uk: 'видалено {d}', ro: 'șters {d}' },
  'docs.trash.restore': { ru: 'Восстановить', en: 'Restore', es: 'Restaurar', uk: 'Відновити', ro: 'Restaurează' },
  'docs.trash.purgeNote': {
    ru: 'удалится навсегда — без возможности восстановить.',
    en: 'will be permanently deleted — cannot be undone.',
    es: 'se eliminará para siempre — sin posibilidad de recuperarlo.',
    uk: 'видалиться назавжди — без можливості відновити.',
    ro: 'va fi șters definitiv — fără posibilitate de recuperare.',
  },

  // lib/docs.ts — DOC_KINDS labels, looked up via docKindLabel()
  'docs.kind.ratecon': { ru: 'Rate con', en: 'Rate con' },
  'docs.kind.driverinfo': { ru: 'Driver Info', en: 'Driver Info' },
  'docs.kind.bol': { ru: 'BOL', en: 'BOL' },
  'docs.kind.pod': { ru: 'POD', en: 'POD' },
  'docs.kind.invoice': { ru: 'Инвойс', en: 'Invoice', es: 'Factura', uk: 'Інвойс', ro: 'Factură' },
  'docs.kind.insurance': { ru: 'Страховка', en: 'Insurance', es: 'Seguro', uk: 'Страховка', ro: 'Asigurare' },
  'docs.kind.registration': { ru: 'Регистрация', en: 'Registration', es: 'Registro', uk: 'Реєстрація', ro: 'Înmatriculare' },
  'docs.kind.repair': { ru: 'Чек за ремонт', en: 'Repair receipt', es: 'Recibo de taller', uk: 'Чек за ремонт', ro: 'Bon de service' },
  'docs.kind.other': { ru: 'Другое', en: 'Other', es: 'Otro', uk: 'Інше', ro: 'Altul' },

  // components/doc-viewer.tsx
  'docs.viewer.zoomIn': { ru: 'Увеличить', en: 'Zoom in', es: 'Ampliar', uk: 'Збільшити', ro: 'Mărește' },
  'docs.viewer.zoomOut': { ru: 'Уменьшить', en: 'Zoom out', es: 'Reducir', uk: 'Зменшити', ro: 'Micșorează' },
  'docs.viewer.opening': { ru: 'Открываю документ…', en: 'Opening document…', es: 'Abriendo el documento…', uk: 'Відкриваю документ…', ro: 'Se deschide documentul…' },
  'docs.viewer.failed': { ru: 'Не удалось показать документ', en: 'Could not display the document', es: 'No se pudo mostrar el documento', uk: 'Не вдалося показати документ', ro: 'Documentul nu a putut fi afișat' },
  'docs.viewer.download': { ru: 'Скачать файл', en: 'Download file', es: 'Descargar el archivo', uk: 'Завантажити файл', ro: 'Descarcă fișierul' },
  'docs.viewer.alt': { ru: 'Документ', en: 'Document', es: 'Documento', uk: 'Документ', ro: 'Document' },
} as const
