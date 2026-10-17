// Имя файла для загрузки — без символов, на которые срабатывает фильтр хостинга.
//
// Hostinger стоит перед приложением с веб-фильтром (WAF), и тот отвечает 403 своей
// страницей на любую загрузку, в ИМЕНИ которой есть `=`, `;` или `'`. Проверено на
// боевом сайте 09/13/26: `invoice=123.pdf` — 403, `invoice123.pdf` — проходит, размер
// и кириллица значения не имеют. До приложения такой запрос не доходит вовсе, а в
// браузере это выглядело как «Вышло обновление приложения». Сработало на рейт-коне TQL,
// который скачивается с именем вида `eyJDYXJyaWVySWQiOj…M30=.pdf`.
//
// Кавычки и обратный слеш заменяются заодно: они ломают заголовок части multipart.

const BAD = /[=;'"\\`]/g

export function safeUploadName(name: string): string {
  return name.replace(BAD, '_')
}

/**
 * Имя, под которым файл уходит по сети: `file.<расширение>`, только латиница и цифры.
 *
 * 17/10/26: замены трёх символов выше мало. Файлы с датой и временем в имени (сканы,
 * скриншоты, фото с телефона) фильтр хостинга тоже режет, но уже не 403: запрос доходит
 * до приложения БЕЗ файла, и диспетчер видел «Файл не выбран.», пока не переименует
 * файл руками. В чистом Next те же имена проходят (проверено next start + Chromium),
 * так что виновато именно имя по дороге. Какое правило фильтра срабатывает, снаружи не
 * узнать, поэтому настоящее имя по сети не идёт вовсе: документы передают его отдельно
 * hex-строкой (lib/send-document.ts), остальным загрузкам нужно только расширение.
 */
export function wireUploadName(name: string): string {
  const ext = /\.([a-z0-9]{1,5})$/i.exec(name)?.[1]?.toLowerCase()
  return ext ? `file.${ext}` : 'file'
}

/** Тот же файл под сетевым именем (wireUploadName); если менять нечего — сам файл. */
export function safeUploadFile(file: File): File {
  const name = wireUploadName(file.name)
  return name === file.name ? file : new File([file], name, { type: file.type, lastModified: file.lastModified })
}

/** Строка в hex UTF-8 — так настоящее имя файла едет мимо фильтра хостинга. */
export function textToHex(s: string): string {
  return Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Файл, прочитанный в память в момент выбора, под сетевым именем (wireUploadName). null — файл пустой
 * или браузер не смог его прочитать: облачный файл (OneDrive, Google Диск) не скачан,
 * файл перенесли или удалили после выбора, фото из галереи телефона уже недоступно.
 *
 * Зачем копия в памяти. До 10/09/26 браузер дочитывал файл с диска только во время
 * отправки, и если в этот момент прочитать не мог, на сервер уходила пустая часть —
 * диспетчер видел «Файл не выбран.», хотя файл выбирал. Теперь непрочитанный файл
 * виден сразу и своими словами, а прочитанный уже не зависит от диска.
 */
export async function readUploadFile(file: File): Promise<File | null> {
  try {
    const bytes = await file.arrayBuffer()
    if (bytes.byteLength === 0) return null
    return new File([bytes], wireUploadName(file.name), {
      type: file.type,
      lastModified: file.lastModified,
    })
  } catch {
    return null
  }
}

/** Байты строкой base64 — запасной путь, когда файл частью формы до сервера не доехал. */
export function bytesToBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes)
  let s = ''
  for (let i = 0; i < view.length; i += 0x8000) s += String.fromCharCode(...view.subarray(i, i + 0x8000))
  return btoa(s)
}
