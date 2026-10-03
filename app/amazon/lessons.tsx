import { t, type Locale } from '@/lib/i18n'

// Уроки Amazon Relay живут на сайте курсов (репо Dispatch4you-Courses, страницы
// protected/pages/amazon-relay*.html). Ссылками, а не копией: уроки там правятся и
// дополняются видео, а доступ к ним платный — сайт курсов сам пускает ученика по
// его входу. Адреса — из nav.html сайта; английские лежат под /en/.
const COURSES = 'https://dispatch4you.com'

const PARTS: { title: 'amazon.lesson1' | 'amazon.lesson2' | 'amazon.lesson3' | 'amazon.lesson4'; page: string; video: string }[] = [
  { title: 'amazon.lesson1', page: 'amazon-relay', video: 'amazon-relay-video' },
  { title: 'amazon.lesson2', page: 'amazon-relay-2-loads', video: 'amazon-relay-video-2' },
  { title: 'amazon.lesson3', page: 'amazon-relay-3-problems', video: 'amazon-relay-video-3' },
  { title: 'amazon.lesson4', page: 'amazon-relay-4-money-rating', video: 'amazon-relay-video-4' },
]

const LINK =
  'inline-flex min-h-9 items-center rounded-lg border border-white/12 px-2.5 text-sm text-t2 hover:border-white/25 hover:text-t1 max-md:min-h-11'

export function AmazonLessons({ locale }: { locale: Locale }) {
  const base = `${COURSES}${locale === 'ru' ? '' : '/en'}/pages/`
  return (
    <div id="amazon-lessons" className="panel scroll-mt-20 p-4">
      <h2 className="text-base font-bold text-t1">{t(locale, 'amazon.lessons')}</h2>
      <p className="mb-3 text-sm text-t2">{t(locale, 'amazon.lessonsHint')}</p>
      <ol className="flex flex-col gap-2">
        {PARTS.map((p, i) => (
          <li key={p.page} className="panel-inset flex flex-wrap items-center gap-2 rounded-xl p-3">
            <span className="nums mr-1 text-sm font-bold text-haul-300">{i + 1}</span>
            <span className="min-w-0 flex-1 text-sm font-semibold text-t1">{t(locale, p.title)}</span>
            <a href={`${base}${p.page}.html`} target="_blank" rel="noopener" className={LINK}>
              📖 {t(locale, 'amazon.lessonRead')}
            </a>
            <a href={`${base}${p.video}.html`} target="_blank" rel="noopener" className={LINK}>
              🎬 {t(locale, 'amazon.lessonVideo')}
            </a>
          </li>
        ))}
      </ol>
    </div>
  )
}
