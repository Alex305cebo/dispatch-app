/**
 * Декодер HERE Flexible Polyline.
 *
 * Зачем свой. HERE отдаёт геометрию маршрута только в этом формате, а нам нужна
 * та же линия, по которой посчитаны платные дороги. Рисовать вместо неё маршрут
 * OSRM было бы почти правдой: OSRM ведёт легковую машину, HERE — трак по
 * разрешённым для него дорогам, и расходятся они как раз там, где стоят пункты
 * оплаты. Показывать одну линию, а цену считать по другой — худший вид «почти
 * работает»: ошибку никто не заметит, пока она не станет дорогой.
 *
 * Формат (github.com/heremaps/flexible-polyline): строка из 64-символьного
 * алфавита, каждый символ несёт 5 бит данных плюс бит продолжения. Сначала два
 * беззнаковых varint — версия и заголовок (точность, третье измерение), дальше
 * пары дельт координат в зигзаг-кодировке.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

const INDEX: Record<string, number> = {}
for (let i = 0; i < ALPHABET.length; i++) INDEX[ALPHABET[i]!] = i

/**
 * Возвращает точки как [lat, lng] — в том же порядке, в каком их ждёт Leaflet и
 * наш FleetMap. Непонятная строка даёт пустой массив, а не исключение: карта без
 * линии — терпимо, упавшая страница — нет.
 */
export function decodeFlexPolyline(encoded: string): [number, number][] {
  if (!encoded) return []
  let i = 0

  // Сдвиги здесь считаются умножением, а не оператором <<: тот работает с 32-битным
  // знаковым числом и на длинном varint молча портит старшие биты.
  function varint(): number | null {
    let result = 0
    let multiplier = 1
    while (i < encoded.length) {
      const value = INDEX[encoded[i]!]
      if (value === undefined) return null
      i++
      result += (value & 0x1f) * multiplier
      if ((value & 0x20) === 0) return result
      multiplier *= 32
    }
    return null
  }

  /** Зигзаг: положительное лежит как 2n, отрицательное как 2|n|-1. */
  const unzig = (n: number) => (n & 1 ? -(n + 1) / 2 : n / 2)

  try {
    const version = varint()
    if (version !== 1) return []
    const header = varint()
    if (header === null) return []

    const precision = header & 15
    const thirdDim = (header >> 4) & 7
    const factor = Math.pow(10, precision)

    const out: [number, number][] = []
    let lat = 0
    let lng = 0

    while (i < encoded.length) {
      const dLat = varint()
      if (dLat === null) break
      const dLng = varint()
      if (dLng === null) break
      // Третье измерение (высота/уровень) читаем и выбрасываем — иначе оно
      // съедет в следующую пару и линия уползёт в океан.
      if (thirdDim !== 0 && varint() === null) break

      lat += unzig(dLat)
      lng += unzig(dLng)
      out.push([lat / factor, lng / factor])
    }
    return out
  } catch {
    return []
  }
}
