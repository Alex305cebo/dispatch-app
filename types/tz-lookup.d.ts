// У пакета нет своих типов и нет @types. Объявление на две строки дешевле, чем
// тянуть ради одной функции чужой пакет типов.
declare module 'tz-lookup' {
  /** Широта, долгота → имя пояса IANA («America/Chicago»). Бросает вне суши. */
  export default function tzLookup(lat: number, lng: number): string
}
