// «Толлы в деньгах» — сколько парк уже отдал платным дорогам за месяц.
//
// Калькулятор отвечает на вопрос «сколько будет стоить», а этот блок — на «сколько
// уже стоило». Пока толлы считались на глаз, они не попадали ни в чистую
// по рейсу, ни в счёт брокеру, и месячная сумма никогда не называлась вслух.

import Link from "next/link";
import type { ReactNode } from "react";
import { usd, usd2 } from "@/lib/fmt";
import { Info } from "@/components/info";
import { RateConButton } from "@/components/ratecon-button";
import { t, type Locale } from "@/lib/i18n";
import type { TollSpend } from "@/lib/toll-spend";

/** «Толлы в деньгах» — две плитки: месяц одной полосой и самые дорогие рейсы.
 *
 *  До 10/09/26 месяц был четырьмя маленькими плитками-числами (сумма, на милю, доля
 *  выручки, рейсы). По плану «Порядок в TMS» и слову владельца («меньше цифр, больше
 *  картинок») — одна карточка: крупно сумма, доля выручки шкалой с риской на 5 %
 *  (выше — жёлтая), остальное одной мелкой строкой. Рейсы — полосами длиной в их
 *  толлы. Пустая выборка (ни у одного рейса толлы не посчитаны) плиток не даёт вовсе. */
export function tollMoneyTiles({
  spend,
  days,
  locale,
  rateCons,
}: {
  spend: TollSpend;
  days: number;
  locale: Locale;
  /** Rate Con груза — кнопка у строки рейса (правило владельца 09.10: документ везде, где груз). */
  rateCons: Map<number, number>;
}): { id: string; node: ReactNode }[] {
  if (spend.counted === 0) return [];
  const heading = t(locale, "tolls.money.title").replace("{days}", String(days));
  // Доля от гросса — та цифра, по которой это сравнивают с топливом: три процента
  // выручки на дороги никто не замечает, пока их не назовут. Шкала до 10 %, риска — 5 %.
  const warn = spend.shareOfGross > 5;
  const shareText = `${spend.shareOfGross.toFixed(1)}% ${t(locale, "tolls.money.share")}`;
  const tiles: { id: string; node: ReactNode }[] = [
    {
      id: "toll-month",
      node: (
        <section className="panel h-full p-4">
          <h2 className="flex items-center gap-1.5 text-base leading-6 font-semibold text-t1">
            {heading}
            <Info text={t(locale, "tolls.money.info")} />
          </h2>
          <div className="mt-3 grid items-center gap-x-6 gap-y-3 sm:grid-cols-[auto_minmax(0,1fr)]">
            <div>
              <div className="nums text-3xl leading-none font-bold text-t1">{usd.format(spend.total)}</div>
              <div className="mt-1.5 text-sm text-t3">
                <span className="nums">{usd2.format(spend.perMile)}</span> {t(locale, "tolls.money.perMile")} ·{" "}
                <span className="nums">{spend.counted}</span> {t(locale, "tolls.money.loads")}
              </div>
            </div>
            <div className="min-w-0">
              <div className={`text-sm font-medium ${warn ? "text-warn-400" : "text-t2"}`}>{shareText}</div>
              <div role="img" aria-label={shareText} className="relative mt-1.5 h-2.5 rounded-full bg-white/8">
                <span
                  className={`absolute inset-y-0 left-0 rounded-full ${warn ? "bg-warn-400" : "bg-haul-400"}`}
                  style={{ width: `${Math.max(2, Math.min(100, spend.shareOfGross * 10))}%` }}
                />
                <span aria-hidden className="absolute -inset-y-1 left-1/2 w-px bg-t2" />
              </div>
              <div aria-hidden className="nums relative mt-1 h-4 text-2xs text-t3">
                <span className="absolute left-0">0%</span>
                <span className="absolute left-1/2 -translate-x-1/2">5%</span>
                <span className="absolute right-0">10%</span>
              </div>
            </div>
          </div>
        </section>
      ),
    },
  ];
  const max = Math.max(...spend.top.map((l) => l.tolls ?? 0));
  if (spend.top.length > 0)
    tiles.push({
      id: "toll-top",
      node: (
        <section className="panel h-full p-4">
          <h2 className="mb-2 text-base leading-6 font-semibold text-t1">{t(locale, "tolls.money.top")}</h2>
          <ul className="flex flex-col gap-1">
            {spend.top.map((l) => {
              const rc = rateCons.get(l.id);
              return (
                <li key={l.id} className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 hover:bg-white/5">
                  <Link
                    href={`/loads/${l.id}`}
                    title={l.miles > 0 ? `${usd2.format((l.tolls ?? 0) / l.miles)}/mi` : undefined}
                    className="group min-w-0 flex-1"
                  >
                    <span className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate text-t2 group-hover:text-t1 group-hover:underline">
                        {l.origin ?? "—"} → {l.destination ?? "—"}
                      </span>
                      <span className="nums shrink-0 font-semibold text-t1">{usd.format(l.tolls ?? 0)}</span>
                    </span>
                    <span className="mt-1 block h-1.5 rounded-full bg-white/8">
                      <span
                        className="block h-full rounded-full bg-warn-400/80"
                        style={{ width: `${max > 0 ? Math.max(3, ((l.tolls ?? 0) / max) * 100) : 0}%` }}
                      />
                    </span>
                  </Link>
                  {rc && <RateConButton docId={rc} compact />}
                </li>
              );
            })}
          </ul>
        </section>
      ),
    });
  return tiles;
}

/** Отдельно и НАД калькулятором: пустое поле толлов в рейсе через Пенсильванию —
 * не ноль, а «не считали», чистая по такому рейсу завышена на неизвестную сумму.
 * Внизу страницы, под справочником, это предупреждение не видел никто. Пояснение —
 * в «i», на виду только число и сами рейсы (10/09/26: меньше текста для чтения). */
export function TollMissing({
  spend,
  locale,
}: {
  spend: TollSpend;
  locale: Locale;
}) {
  if (spend.missing.length === 0) return null;
  return (
    <div className="mb-4 rounded-xl border border-warn-500/25 bg-warn-500/[0.07] p-3">
      <p className="flex items-center gap-1.5 text-sm font-medium text-warn-400">
        {t(locale, "tolls.money.missing").replace(
          "{n}",
          String(spend.missing.length),
        )}
        <Info text={t(locale, "tolls.money.missingWhy")} />
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {/* На телефоне — четыре: восемь длинных маршрутов вставали столбиком на весь экран. */}
        {spend.missing.slice(0, 8).map((l, i) => (
          <Link
            key={l.id}
            href={`/loads/${l.id}`}
            className={`rounded-full bg-white/8 px-2 py-0.5 text-xs text-t2 transition-colors hover:bg-white/15 hover:text-white ${i >= 4 ? "max-md:hidden" : ""}`}
          >
            {l.origin ?? "—"} → {l.destination ?? "—"}
          </Link>
        ))}
      </div>
    </div>
  );
}
