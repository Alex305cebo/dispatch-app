// 'server-only' makes any client component that transitively imports this module
// fail at BUILD with a clear message — instead of the old runtime "DATABASE_URL is
// not set" throw in the browser. Every db-touching lib flows through here, so this
// one guard covers the whole server/client boundary.
import 'server-only'
import { neon, type NeonQueryFunction } from '@neondatabase/serverless'

/**
 * Подключение создаётся ЛЕНИВО — при первом запросе, а не при загрузке модуля.
 *
 * Раньше проверка DATABASE_URL стояла на верхнем уровне, и этого хватало, чтобы
 * уронить всю сборку: `next build` на шаге «Collecting page data» грузит
 * серверные маршруты, маршрут тянет этот модуль, модуль бросает исключение —
 * сборка падает целиком, хотя ни одного запроса к базе не сделано.
 *
 * Для установки клиенту это была настоящая ловушка. Порядок действий
 * естественный: подключить репозиторий к хостингу, потом вписать переменные. Но
 * Hostinger начинает сборку сразу при подключении, до того как переменные
 * заданы, — и первый деплой падал с ошибкой про базу, хотя база уже создана и
 * дело только в порядке шагов.
 *
 * Теперь без переменной падает первый ЗАПРОС, а не сборка: сообщение то же и
 * такое же громкое, но приложение собирается, и переменную можно вписать
 * следующим шагом.
 */
/** Тот же тип, что давал прежний `neon(url)`: дженерики по умолчанию.
 * ReturnType<typeof neon> здесь не годится — он отдаёт объединение всех форм,
 * и любой `rows[0]` у вызывающих переставал типизироваться. */
type Sql = NeonQueryFunction<false, false>

let client: Sql | null = null

function connect(): Sql {
  if (client) return client
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      'DATABASE_URL не задан. Создайте бесплатный проект Neon и впишите строку ' +
        'подключения в .env.local (см. .env.local.example), а на хостинге — в ' +
        'hPanel → Environment variables.',
    )
  }
  client = neon(url)
  return client
}

/**
 * Tagged template — sql`... ${id} ...` параметризует значения сам, так что
 * защищать тут ORM нечего.
 *
 * Обёрнуто в Proxy, а не в стрелку: драйвер Neon — это функция, у которой есть
 * ещё и свойства, и подмена её голой функцией тихо отрезала бы всё, кроме
 * вызова. Proxy пробрасывает и вызов, и обращения к свойствам.
 */
export const sql = new Proxy((() => {}) as unknown as Sql, {
  apply(_target, _thisArg, args: unknown[]) {
    return (connect() as unknown as (...a: unknown[]) => unknown)(...args)
  },
  get(_target, prop) {
    return (connect() as unknown as Record<string | symbol, unknown>)[prop]
  },
})
