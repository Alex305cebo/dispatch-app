// «Толлы в деньгах» — сколько парк уже отдал платным дорогам за месяц.
//
// Калькулятор выше отвечает на вопрос «сколько будет стоить», а этот блок — на
// «сколько уже стоило». Пока толлы считались на глаз, они не попадали ни в чистую
// по рейсу, ни в счёт брокеру, и месячная сумма никогда не называлась вслух.

import Link from "next/link";
import type { ReactNode } from "react";
import { usd, usd2 } from "@/lib/fmt";
import { Info } from "@/components/info";
import { t, type Locale } from "@/lib/i18n";
import type { TollSpend } from "@/lib/toll-spend";

/** «Толлы в деньгах» — отдельными плитками, а не одной карточкой на всю строку.
 *  Четыре числа месяца и список самых дорогих рейсов: раньше они жили внутри одного
 *  блока, и двигать там было нечего. Пустая выборка (ни у одного рейса толлы не
 *  посчитаны) плиток не даёт вовсе. */
export function tollMoneyTiles({
  spend,
  days,
  locale,
}: {
  spend: TollSpend;
  days: number;
  locale: Locale;
}): { id: string; node: ReactNode }[] {
  if (spend.counted === 0) return [];
  const heading = t(locale, "tolls.money.title").replace("{days}", String(days));
  const tiles: { id: string; node: ReactNode }[] = [
    {
      id: 'toll-total',
      node: <Tile value={usd.format(spend.total)} label={t(locale, "tolls.money.total")} info={t(locale, "tolls.money.info")} />,
    },
    {
      id: 'toll-per-mile',
      node: <Tile value={`${usd2.format(spend.perMile)}/mi`} label={t(locale, "tolls.money.perMile")} />,
    },
    {
      // Доля от гросса — та цифра, по которой это сравнивают с топливом: три
      // процента выручки на дороги никто не замечает, пока их не назовут.
      id: 'toll-share',
      node: (
        <Tile
          value={`${spend.shareOfGross.toFixed(1)}%`}
          label={t(locale, "tolls.money.share")}
          tone={spend.shareOfGross > 5 ? "warn" : undefined}
        />
      ),
    },
    {
      id: 'toll-loads',
      node: <Tile value={String(spend.counted)} label={t(locale, "tolls.money.loads")} />,
    },
  ];
  if (spend.top.length > 0)
    tiles.push({
      id: 'toll-top',
      node: (
        <section className="panel h-full p-4">
          <h2 className="mb-2 text-base leading-6 font-semibold text-t1">{heading}</h2>
          <ul className="flex flex-col gap-1">
            {spend.top.map((l) => (
              <li
                key={l.id}
                className="flex items-start gap-2 rounded-lg px-1.5 py-1.5 text-sm hover:bg-white/5"
              >
                <Link
                  href={`/loads/${l.id}`}
                  className="min-w-0 flex-1 leading-4 text-t2 hover:text-white hover:underline"
                >
                  {l.origin ?? "—"} → {l.destination ?? "—"}
                </Link>
                <span className="nums shrink-0 text-t3">
                  {l.miles > 0 ? `${usd2.format((l.tolls ?? 0) / l.miles)}/mi` : ""}
                </span>
                <span className="nums shrink-0 font-semibold text-t1">
                  {usd.format(l.tolls ?? 0)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ),
    });
  return tiles;
}

/** Маленькая плитка с числом: сама себе карточка, а не вставка внутри общего блока. */
function Tile({
  value,
  label,
  tone,
  info,
}: {
  value: string;
  label: string;
  tone?: "warn";
  info?: string;
}) {
  return (
    <div className="panel flex h-full flex-col justify-center px-3 py-2.5">
      <div
        className={`nums truncate text-xl font-bold ${tone === "warn" ? "text-warn-400" : "text-t1"}`}
      >
        {value}
      </div>
      <div className="mt-0.5 flex items-center gap-1 text-xs font-medium text-t2">
        <span className="truncate">{label}</span>
        {info && <Info text={info} />}
      </div>
    </div>
  );
}

/** Отдельно и НАД калькулятором: пустое поле толлов в рейсе через Пенсильванию —
 * не ноль, а «не считали», чистая по такому рейсу завышена на неизвестную сумму.
 * Внизу страницы, под справочником, это предупреждение не видел никто. */
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
      <p className="text-sm font-medium text-warn-400">
        {t(locale, "tolls.money.missing").replace(
          "{n}",
          String(spend.missing.length),
        )}
      </p>
      <p className="mt-0.5 text-xs leading-relaxed text-t3">
        {t(locale, "tolls.money.missingWhy")}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {spend.missing.slice(0, 8).map((l) => (
          <Link
            key={l.id}
            href={`/loads/${l.id}`}
            className="rounded-full bg-white/8 px-2 py-0.5 text-xs text-t2 transition-colors hover:bg-white/15 hover:text-white"
          >
            {l.origin ?? "—"} → {l.destination ?? "—"}
          </Link>
        ))}
      </div>
    </div>
  );
}
