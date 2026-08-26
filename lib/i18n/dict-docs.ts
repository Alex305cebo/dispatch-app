// Documents domain: app/docs/**, docs.tsx, doc-viewer.tsx, lib/docs.ts.

export const docsDict = {
  'docs.unattached.recognize': { ru: 'Распознать → груз', en: 'Recognise → load' },
  'docs.unattached.working': { ru: 'Читаю…', en: 'Reading…' },
  'docs.unattached.attachTo': { ru: 'Прикрепить к грузу…', en: 'Attach to load…' },
  'docs.unattached.recognizedToast': { ru: 'Груз создан из rate con', en: 'Load created from the rate con' },
  'docs.unattached.attachedToast': { ru: 'Файл прикреплён к грузу', en: 'File attached to the load' },
  // app/docs/page.tsx
  'docs.title': { ru: 'Документы', en: 'Documents' },
  'docs.info': {
    ru: 'Единая библиотека всех бумаг: rate con, BOL, POD, страховки, регистрации, инвойсы. Сгруппированы по тракам и водителям, свежие сверху, с фильтром по типу. Rate con можно распознать и сразу создать груз кнопкой сверху. Удаление под именем и PIN перемещает в корзину — насовсем только оттуда, запись остаётся в Журнале.',
    en: 'A single library for every document: rate con, BOL, POD, insurance, registration, invoices. Grouped by truck and driver, most recent first, with a filter by type. A rate con can be recognized and turned straight into a load with the button above. Deleting moves it to Trash — permanent deletion only happens from there, and the record stays in the Log.',
  },
  'docs.subtitle': {
    ru: 'Все бумаги в одном месте — по водителям и датам, как в библиотеке.',
    en: 'All your paperwork in one place — by driver and date, like a library.',
  },
  'docs.recognize.title': { ru: 'Распознать rate con', en: 'Recognize a rate con' },
  'docs.recognize.sub': {
    ru: 'Перетащи PDF или фото — ИИ прочитает и сразу создаст груз',
    en: 'Drop a PDF or photo — AI reads it and creates the load instantly',
  },
  'docs.tab.library': { ru: 'Библиотека', en: 'Library' },
  'docs.tab.trash': { ru: 'Корзина', en: 'Trash' },

  // components/docs.tsx — DocUpload
  'docs.upload.saved': { ru: 'Документ сохранён', en: 'Document saved' },
  'docs.upload.noTruck': { ru: 'Без трака', en: 'No truck' },
  'docs.upload.uploading': { ru: 'Загружаю…', en: 'Uploading…' },
  'docs.upload.file': { ru: '+ Файл', en: '+ File' },
  'docs.upload.hint': { ru: 'PDF или фото, до 8 МБ', en: 'PDF or photo, up to 8MB' },
  'docs.upload.info': {
    ru: 'Выбери тип документа (Rate con / BOL / POD / инвойс / страховка / регистрация), при загрузке в общий раздел — трак, и добавь файл. Хранится в базе, привязан к грузу или траку, скачивается по клику.',
    en: 'Choose the document type (Rate con / BOL / POD / invoice / insurance / registration), pick a truck when uploading from the shared section, and add the file. Stored in the database, linked to the load or truck, downloads on click.',
  },

  // DeleteDialog
  'docs.delete.title': { ru: 'Удалить документ', en: 'Delete document' },
  'docs.delete.body': {
    ru: '«{t}» переместится в корзину — насовсем удаляется только оттуда. Напечатай DELETE заглавными, чтобы подтвердить. Запись, кто удалил, останется в Журнале.',
    en: '"{t}" will move to Trash — it is only permanently deleted from there. Type DELETE in capitals to confirm. The record of who deleted it stays in the Log.',
  },
  'docs.delete.cancel': { ru: 'Отмена', en: 'Cancel' },
  'docs.delete.deleting': { ru: 'Удаляю…', en: 'Deleting…' },
  'docs.delete.confirm': { ru: 'Удалить', en: 'Delete' },
  'docs.delete.done': { ru: 'Документ удалён', en: 'Document deleted' },
  'docs.delete.rowTitle': { ru: 'Удалить', en: 'Delete' },

  // DocRow
  'docs.row.truck': { ru: 'трак', en: 'truck' },
  'docs.row.load': { ru: 'груз', en: 'load' },

  // DocList / DocLibrary
  'docs.list.empty': { ru: 'Документов пока нет.', en: 'No documents yet.' },
  'docs.library.more': { ru: 'ещё {n}', en: '{n} more' },
  'docs.library.all': { ru: 'Все', en: 'All' },
  'docs.library.empty': { ru: 'Ничего не найдено.', en: 'Nothing found.' },

  // DocTrash
  'docs.trash.restored': { ru: 'Восстановлено', en: 'Restored' },
  'docs.trash.empty': { ru: 'Корзина пуста.', en: 'Trash is empty.' },
  'docs.trash.deletedOn': { ru: 'удалено {d}', en: 'deleted {d}' },
  'docs.trash.restore': { ru: 'Восстановить', en: 'Restore' },
  'docs.trash.purgeNote': {
    ru: 'удалится навсегда — без возможности восстановить.',
    en: 'will be permanently deleted — cannot be undone.',
  },

  // lib/docs.ts — DOC_KINDS labels, looked up via docKindLabel()
  'docs.kind.ratecon': { ru: 'Rate con', en: 'Rate con' },
  'docs.kind.driverinfo': { ru: 'Driver Info', en: 'Driver Info' },
  'docs.kind.bol': { ru: 'BOL', en: 'BOL' },
  'docs.kind.pod': { ru: 'POD', en: 'POD' },
  'docs.kind.invoice': { ru: 'Инвойс', en: 'Invoice' },
  'docs.kind.insurance': { ru: 'Страховка', en: 'Insurance' },
  'docs.kind.registration': { ru: 'Регистрация', en: 'Registration' },
  'docs.kind.repair': { ru: 'Чек за ремонт', en: 'Repair receipt' },
  'docs.kind.other': { ru: 'Другое', en: 'Other' },

  // components/doc-viewer.tsx
  'docs.viewer.zoomIn': { ru: 'Увеличить', en: 'Zoom in' },
  'docs.viewer.zoomOut': { ru: 'Уменьшить', en: 'Zoom out' },
  'docs.viewer.opening': { ru: 'Открываю документ…', en: 'Opening document…' },
  'docs.viewer.failed': { ru: 'Не удалось показать документ', en: 'Could not display the document' },
  'docs.viewer.download': { ru: 'Скачать файл', en: 'Download file' },
  'docs.viewer.alt': { ru: 'Документ', en: 'Document' },
} as const
