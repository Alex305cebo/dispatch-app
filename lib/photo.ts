// Ужать фото перед записью в базу. Телефон отдаёт 3–4 МБ на снимок, а показываем
// мы кружок 40px и шапку карточки; при этом каждая отдача из Neon — это сетевой
// трафик, которого на бесплатном плане 5 ГБ в месяц. В сентябре 2026 фото парка
// съели лимит за 12 дней, и база встала до конца месяца. Аватар — 512px, фото
// трака — 1200px; JPEG 80 даёт 30–150 КБ вместо мегабайт.
export async function shrinkPhoto(buf: Buffer, px: number): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  return sharp(buf).rotate().resize(px, px, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer()
}
