// Загрузка документа из браузера — одна дорога для всех кнопок «＋ BOL / POD / Rate Con».
//
// 1. Файл читается в память сразу (readUploadFile): пустой или непрочитанный — понятная
//    ошибка здесь же, а не «Файл не выбран.» с сервера.
// 2. Больше 8 МБ — отказ до отправки: такой запрос сервер обрывал, и вместо ошибки
//    падала вся страница.
// 3. Если файл частью формы до сервера всё-таки не доехал (сервер ответил noFile), тот же
//    файл уходит второй раз строкой base64 — обычным полем формы, которое по дороге
//    не теряется.

import { uploadDocument } from '@/app/actions'
import { t, type Locale } from '@/lib/i18n'
import { bytesToBase64, readUploadFile, textToHex } from '@/lib/upload-name'

const MAX_DOC_BYTES = 8 * 1024 * 1024

type Fields = Record<string, string | number | null | undefined>

export async function sendDocument(
  file: File,
  fields: Fields,
  locale: Locale,
): Promise<{ id: number } | { error: string }> {
  const ready = await readUploadFile(file)
  if (!ready) return { error: t(locale, 'actions.fileUnreadable') }
  if (ready.size > MAX_DOC_BYTES) return { error: t(locale, 'actions.fileOver8mb') }

  // Настоящее имя и подпись — только hex-строкой: в открытом виде имя с датой и временем
  // фильтр хостинга вырезает вместе с файлом (см. wireUploadName).
  const { title, ...rest } = fields
  const form = () => {
    const fd = new FormData()
    for (const [k, v] of Object.entries(rest)) if (v != null && v !== '') fd.append(k, String(v))
    fd.append('nameHex', textToHex(file.name))
    if (title != null && title !== '') fd.append('titleHex', textToHex(String(title)))
    return fd
  }
  const fd = form()
  fd.append('file', ready)
  const res = await uploadDocument(fd)
  if (!('noFile' in res)) return res

  const again = form()
  again.append('fileB64', bytesToBase64(await ready.arrayBuffer()))
  again.append('fileType', ready.type)
  return uploadDocument(again)
}
