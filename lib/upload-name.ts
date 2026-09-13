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

/** Тот же файл под безопасным именем; если менять нечего — сам файл. */
export function safeUploadFile(file: File): File {
  const name = safeUploadName(file.name)
  return name === file.name ? file : new File([file], name, { type: file.type, lastModified: file.lastModified })
}
