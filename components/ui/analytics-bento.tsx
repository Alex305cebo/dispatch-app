"use client";

import * as React from "react";

/* ------------------------------------------------------------------ */
/*  Analytics Bento: four live cards (revenue, sessions, categories,   */
/*  seasonality). SVG only, no chart library.                          */
/*                                                                     */
/*  Взят с 21st.dev (@romanvasnev/analytics-bento, 10/22/26) и        */
/*  переложен на тему TMS: вместо shadcn-токенов (bg-card,              */
/*  text-foreground, border-border…) — panel / panel-inset, text-t1/t3, */
/*  border-white/10, акцент haul-* (его перекрашивает «Вид»). Тёмная    */
/*  тема у нас — data-theme на <html>, а не класс .dark, поэтому dark:  */
/*  отсюда убраны. Бейдж «by vasnev.art» убран. Подписи подсказок        */
/*  приходят пропсом labels (6 языков), ось волн — пропсом axis.         */
/*  Всё нажимается (владелец, 10/22/26): за точкой, днём, плиткой,       */
/*  месяцем и строкой лежат ids грузов — onOpenLoads открывает их списком.  */
/* ------------------------------------------------------------------ */

type Point = { label: string; value: number; ids?: number[] };
/** Нажали на точку графика: что это и какие грузы за ней. */
export type Pick = (title: string, ids: number[]) => void;

export type AnalyticsBentoProps = React.JSX.IntrinsicElements["div"] & {
  currency?: string;
  revenue: {
    label: string;
    value: number;
    delta: string;
    note?: React.ReactNode;
    caption?: string;
    series: Point[];
  };
  sessions: {
    label: string;
    value: number;
    delta: string;
    note?: React.ReactNode;
    /** values per axis step; first array is the current period, the rest are prior periods */
    desktop: number[][];
    mobile: number[][];
    /** подписи точек оси (часы, дни недели) */
    axis: string[];
    /** ids грузов текущего периода по точкам оси */
    ids?: number[][];
    labels?: { desktop: string; mobile: string; prior: string; current: string };
  };
  categories: {
    title: string;
    groups: { id: string; name: string; color: string; ink?: "dark" | "light" }[];
    periods: { label: string; total: number; delta: string; compare: string; ids?: number[] }[];
    /** one value per period, in the same order as `periods` */
    items: { name: string; group: string; values: number[]; ids?: number[][] }[];
    table?: { columns: string[]; rows: { label: string; values: string[]; ids?: number[] }[] };
  };
  seasonality: {
    title: string;
    axis?: string[];
    years: {
      label: string;
      values: number[];
      /** ids грузов по месяцам */
      ids?: number[][];
      stats: { label: string; value: number; delta: string; note: string }[];
      rows: { label: string; value: string; ids?: number[] }[];
    }[];
  };
  /** Слова в подсказках и подписях для чтения с экрана. */
  labels: { revenue: string; share: string; value: string; year: string };
  onOpenLoads?: Pick;
  /** Chart colors. Each can be any CSS color. */
  colors?: { revenue?: [string, string]; desktop?: [string, string]; mobile?: [string, string]; radar?: string };
  fontFamily?: string;
  monoFamily?: string;
};

/* ---------------- helpers ---------------- */

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

function useReducedMotion() {
  const [r, setR] = React.useState(false);
  React.useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setR(m.matches);
    const on = () => setR(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return r;
}

function useSize() {
  const ref = React.useRef(null as HTMLDivElement | null);
  const [size, setSize] = React.useState({ w: 0, h: 0 });
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width), h = Math.round(e.contentRect.height);
      setSize((p) => (p.w === w && p.h === h ? p : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

/** smooth path through points (catmull-rom as cubic beziers) */
function smooth(P: [number, number][]) {
  const n = P.length;
  if (n < 2) return "";
  const g = (i: number) => P[Math.max(0, Math.min(n - 1, i))];
  let d = `M${P[0][0]},${P[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2), k = 0.18;
    d += `C${p1[0] + (p2[0] - p0[0]) * k},${p1[1] + (p2[1] - p0[1]) * k} ${p2[0] - (p3[0] - p1[0]) * k},${p2[1] - (p3[1] - p1[1]) * k} ${p2[0]},${p2[1]}`;
  }
  return d;
}

function CountUp({ value, prefix = "", duration = 1100 }: { value: number; prefix?: string; duration?: number }) {
  const ref = React.useRef(null as HTMLSpanElement | null);
  const from = React.useRef(0);
  const reduce = useReducedMotion();
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce) { el.textContent = prefix + fmt(value); from.current = value; return; }
    const a = from.current, t0 = performance.now();
    let raf = 0;
    const f = (now: number) => {
      const t = Math.min(1, (now - t0) / duration), v = a + (value - a) * ease(t);
      el.textContent = prefix + fmt(v); from.current = v;
      if (t < 1) raf = requestAnimationFrame(f);
    };
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
  }, [value, prefix, duration, reduce]);
  return <span ref={ref}>{prefix}0</span>;
}

/* ---------------- tooltip ---------------- */

type Tip = { title: string; rows: { label: string; value: string; color?: string }[] };
type TipApi = { show: (x: number, y: number, t: Tip) => void; hide: () => void };
type TipRef = { current: TipApi | null };

function Tooltip({ mono, api }: { mono: string; api: TipRef }) {
  const [tip, setTip] = React.useState(null as (Tip & { x: number; y: number }) | null);
  const [pos, setPos] = React.useState({ l: 0, t: 0 });
  const box = React.useRef(null as HTMLDivElement | null);
  React.useEffect(() => {
    api.current = { show: (x, y, t) => setTip({ ...t, x, y }), hide: () => setTip(null) };
    return () => { api.current = null; };
  }, [api]);
  React.useLayoutEffect(() => {
    if (!tip || !box.current) return;
    const r = box.current.getBoundingClientRect();
    let l = tip.x + 14, t = tip.y - r.height - 12;
    if (l + r.width > window.innerWidth - 8) l = tip.x - r.width - 14;
    if (t < 8) t = tip.y + 16;
    setPos({ l, t });
  }, [tip]);
  return (
    <div
      ref={box}
      role="tooltip"
      className={`pointer-events-none fixed z-50 whitespace-nowrap rounded-xl border border-white/10 bg-ink-900/95 px-2.5 py-2 text-xs text-t1 shadow-e2 backdrop-blur-md transition-opacity duration-150 ${tip ? "opacity-100" : "opacity-0"}`}
      style={{ left: pos.l, top: pos.t }}
    >
      {tip && (
        <>
          <div className="mb-1 text-t3">{tip.title}</div>
          {tip.rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 text-t3">
                {r.color && <i className="inline-block size-2 rounded-[2px]" style={{ background: r.color }} />}
                {r.label}
              </span>
              <b className="font-medium" style={{ fontFamily: mono, fontVariantNumeric: "tabular-nums" }}>{r.value}</b>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/* ---------------- shared bits ---------------- */

const Arrow = ({ down }: { down?: boolean }) => (
  <svg viewBox="0 0 12 12" className={`size-[11px] ${down ? "rotate-180" : ""}`} aria-hidden="true">
    <path d="M6 10.5V1.5M2 5.5l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
/** Рост — зелёным вверх, падение («-4%») — красным вниз; пустая строка — ничего. */
const Delta = ({ children, className = "" }: { children: string; className?: string }) => {
  if (!children) return null;
  const down = children.startsWith("-");
  return (
    <span className={`inline-flex items-center gap-[3px] font-semibold tracking-[-0.02em] ${down ? "text-bad-400" : "text-good-400"} ${className}`}>
      <Arrow down={down} />
      {children.replace(/^[+-]/, "")}
    </span>
  );
};
const Card = ({ className = "", children, ...rest }: React.JSX.IntrinsicElements["section"]) => (
  <section className={`panel relative min-w-0 overflow-hidden p-5 text-t1 sm:p-6 ${className}`} {...rest}>
    {children}
  </section>
);

function Segmented({ items, value, onChange, label }: { items: string[]; value: number; onChange: (i: number) => void; label: string }) {
  const refs = React.useRef([] as (HTMLButtonElement | null)[]);
  const [thumb, setThumb] = React.useState({ x: 0, w: 0 });
  React.useLayoutEffect(() => {
    const b = refs.current[value];
    if (b) setThumb({ x: b.offsetLeft, w: b.offsetWidth });
  }, [value, items]);
  return (
    <div role="tablist" aria-label={label} className="relative inline-grid h-[30px] auto-cols-fr grid-flow-col rounded-[10px] bg-white/5 p-[2px]">
      <div
        className="absolute bottom-[2px] top-[2px] rounded-[8px] bg-ink-900 shadow-e1 ring-1 ring-white/10 transition-[transform,width] duration-300 [transition-timing-function:cubic-bezier(.2,.9,.25,1)]"
        style={{ width: thumb.w, transform: `translateX(${thumb.x - 2}px)`, left: 2 }}
      />
      {items.map((it, i) => (
        <button
          key={it}
          ref={(el) => { refs.current[i] = el; }}
          role="tab"
          type="button"
          aria-selected={i === value}
          onClick={() => onChange(i)}
          className={`nums relative z-10 rounded-[8px] px-3 text-xs font-medium tracking-[-0.01em] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-haul-400 ${i === value ? "text-t1" : "text-t3"}`}
        >
          {it}
        </button>
      ))}
    </div>
  );
}

/* ---------------- A: revenue line ---------------- */

function RevenueChart({ series, caption, prefix, colors, mono, tip, word, onPick }: { series: Point[]; caption?: string; prefix: string; colors: [string, string]; mono: string; tip: TipRef; word: string; onPick?: (i: number) => void }) {
  const [ref, { w: W, h: H }] = useSize();
  const reduce = useReducedMotion();
  const [drawn, setDrawn] = React.useState(false);
  const [hover, setHover] = React.useState(null as number | null);
  const id = React.useId().replace(/:/g, "");
  React.useEffect(() => { if (!W) return; const r = requestAnimationFrame(() => requestAnimationFrame(() => setDrawn(true))); return () => cancelAnimationFrame(r); }, [W]);

  const vals = series.map((s) => s.value);
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  const raw = span / 4, mag = Math.pow(10, Math.floor(Math.log10(raw))), step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const mn = lo - span * 0.45, mx = hi + span * 0.08, top = 30, bot = 14;
  const Y = (v: number) => top + (1 - (v - mn) / (mx - mn)) * (H - top - bot);
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) ticks.push(v);
  const P = vals.map((v, i) => [14 + (i / (vals.length - 1)) * (W - 66), Y(v)] as [number, number]);
  const d = W ? smooth(P) : "";
  const last = P[P.length - 1];
  const compact = (v: number) => (v >= 1000 ? (v / 1000).toFixed(step < 1000 ? 1 : 0) + "K" : String(v));

  const at = (e: { clientX: number; currentTarget: EventTarget }) => {
    const r = (e.currentTarget as SVGRectElement).ownerSVGElement!.getBoundingClientRect();
    return { r, i: Math.max(0, Math.min(vals.length - 1, Math.round(((e.clientX - r.left - 14) / (W - 66)) * (vals.length - 1)))) };
  };
  const move = (e: React.PointerEvent) => {
    const { r, i } = at(e);
    setHover(i);
    tip.current?.show(r.left + P[i][0], r.top + P[i][1], { title: series[i].label, rows: [{ label: word, value: prefix + fmt(vals[i]), color: colors[1] }] });
  };

  return (
    <div ref={ref} className="panel-inset relative min-h-[190px] flex-1 overflow-hidden rounded-[18px]">
      {caption && <div className="pointer-events-none absolute left-3 top-2.5 text-2xs tracking-[-0.01em] text-t3">{caption}</div>}
      {W > 0 && (
        <svg width={W} height={H} className="block" role="img" aria-label={`${caption ?? word}: ${prefix}${fmt(vals[0])} → ${prefix}${fmt(vals[vals.length - 1])}`}>
          <defs>
            <linearGradient id={`${id}l`} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" style={{ stopColor: colors[0] }} />
              <stop offset="1" style={{ stopColor: colors[1] }} />
            </linearGradient>
            <linearGradient id={`${id}a`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" style={{ stopColor: colors[1], stopOpacity: 0.18 }} />
              <stop offset="1" style={{ stopColor: colors[1], stopOpacity: 0 }} />
            </linearGradient>
            <linearGradient id={`${id}m`} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="#fff" stopOpacity="0.2" />
              <stop offset="1" stopColor="#fff" stopOpacity="1" />
            </linearGradient>
            <mask id={`${id}k`}><rect width={W} height={H} fill={`url(#${id}m)`} /></mask>
          </defs>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={0} x2={W} y1={Y(v)} y2={Y(v)} className="stroke-white/10" strokeWidth={1} />
              <text x={W - 10} y={Y(v) - 5} textAnchor="end" fontSize={10} className="fill-t3" style={{ fontFamily: mono }}>{compact(v)}</text>
            </g>
          ))}
          <path d={`${d}L${last[0]},${H}L${P[0][0]},${H}Z`} fill={`url(#${id}a)`} mask={`url(#${id}k)`} />
          <path
            d={d}
            pathLength={1}
            fill="none"
            stroke={`url(#${id}l)`}
            strokeWidth={2.5}
            strokeLinecap="round"
            style={{ strokeDasharray: 1, strokeDashoffset: drawn || reduce ? 0 : 1, transition: reduce ? "none" : "stroke-dashoffset 1.4s cubic-bezier(.3,.8,.2,1) .2s" }}
          />
          <circle cx={last[0]} cy={last[1]} r={4.5} style={{ fill: colors[1] }} className="stroke-ink-900" strokeWidth={2} />
          {hover !== null && (
            <>
              <line x1={P[hover][0]} x2={P[hover][0]} y1={0} y2={H} className="stroke-t3/50" strokeWidth={1} />
              <circle cx={P[hover][0]} cy={P[hover][1]} r={4.5} style={{ fill: colors[1] }} className="stroke-ink-900" strokeWidth={2} />
            </>
          )}
          <rect width={W} height={H} fill="transparent" className={onPick ? "cursor-pointer" : undefined} onClick={(e) => onPick?.(at(e).i)} onPointerMove={move} onPointerLeave={() => { setHover(null); tip.current?.hide(); }} />
        </svg>
      )}
    </div>
  );
}

/* ---------------- B: two mirrored waves ---------------- */

function SessionsChart({ desktop, mobile, axis, labels, colors, tip, onPick }: { desktop: number[][]; mobile: number[][]; axis: string[]; labels: { desktop: string; mobile: string; current: string }; colors: { desktop: [string, string]; mobile: [string, string] }; tip: TipRef; onPick?: (i: number) => void }) {
  const [ref, { w: W, h: H }] = useSize();
  const reduce = useReducedMotion();
  const id = React.useId().replace(/:/g, "");
  const paths = React.useRef([] as (SVGPathElement | null)[]);
  const [hover, setHover] = React.useState(null as number | null);
  const n = desktop[0]?.length ?? 0;
  const max = Math.max(1, ...desktop.flat(), ...mobile.flat());
  const pad = 18, mid = H / 2, amp = H / 2 - 14;
  const X = (i: number) => pad + 6 + (i / (n - 1)) * (W - 2 * pad - 12);
  const sets = React.useMemo(
    () => [
      ...desktop.map((a, k) => ({ a, dir: -1, k, g: "d" })),
      ...mobile.map((a, k) => ({ a, dir: 1, k, g: "m" })),
    ],
    [desktop, mobile],
  );

  React.useEffect(() => {
    if (!W || !H) return;
    let raf = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      const t = (now - t0) / 1000, grow = reduce ? 1 : ease(Math.min(1, t / 1.3));
      sets.forEach((s, j) => {
        const breathe = reduce ? 1 : 1 + Math.sin(t * 1.2 + s.k * 0.9) * 0.035;
        const P = s.a.map((v, i) => [X(i), mid + s.dir * (3 + (v / max) * amp * grow * breathe)] as [number, number]);
        paths.current[j]?.setAttribute("d", smooth(P));
      });
      if (!reduce) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [W, H, sets, reduce, max]);

  const at = (e: { clientX: number; currentTarget: EventTarget }) => {
    const r = (e.currentTarget as SVGRectElement).ownerSVGElement!.getBoundingClientRect();
    return { r, i: Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left - pad - 6) / (W - 2 * pad - 12)) * (n - 1)))) };
  };
  const move = (e: React.PointerEvent) => {
    const { r, i } = at(e);
    setHover(i);
    tip.current?.show(r.left + X(i), r.top + 12, {
      title: `${axis[i] ?? ""} · ${labels.current}`,
      rows: [
        { label: labels.desktop, value: fmt(desktop[0][i]), color: colors.desktop[1] },
        { label: labels.mobile, value: fmt(mobile[0][i]), color: colors.mobile[1] },
      ],
    });
  };

  return (
    <div className="flex min-h-[210px] flex-1 flex-col">
      <div ref={ref} className="panel-inset relative min-h-[190px] flex-1 overflow-hidden rounded-[18px]">
        {W > 0 && (
          <svg width={W} height={H} className="block" role="img" aria-label={`${labels.desktop} / ${labels.mobile}`}>
            <defs>
              <linearGradient id={`${id}d`} x1="0" x2="1" y1="0" y2="0">
                <stop offset=".1" style={{ stopColor: colors.desktop[0] }} />
                <stop offset=".9" style={{ stopColor: colors.desktop[1] }} />
              </linearGradient>
              <linearGradient id={`${id}m`} x1="0" x2="1" y1="0" y2="0">
                <stop offset=".15" style={{ stopColor: colors.mobile[0] }} />
                <stop offset=".85" style={{ stopColor: colors.mobile[1] }} />
              </linearGradient>
            </defs>
            {Array.from({ length: 9 }, (_, i) => 10 + ((H - 20) * i) / 8).map((y) => (
              <g key={y} className="stroke-t3/50">
                <line x1={8} x2={14} y1={y} y2={y} strokeWidth={1} />
                <line x1={W - 14} x2={W - 8} y1={y} y2={y} strokeWidth={1} />
              </g>
            ))}
            <line x1={pad + 6} x2={W - pad - 6} y1={mid} y2={mid} className="stroke-white/10" strokeWidth={1} />
            {sets.map((s, j) => (
              <path
                key={`${s.g}${s.k}`}
                ref={(el) => { paths.current[j] = el; }}
                fill="none"
                stroke={`url(#${id}${s.g})`}
                strokeWidth={s.k === 0 ? 2.5 : 1.6}
                strokeLinecap="round"
                opacity={s.k === 0 ? 1 : s.k === 1 ? 0.55 : 0.3}
              />
            ))}
            {hover !== null && <line x1={X(hover)} x2={X(hover)} y1={4} y2={H - 4} className="stroke-t3/60" strokeWidth={1} />}
            <rect width={W} height={H} fill="transparent" className={onPick ? "cursor-pointer" : undefined} onClick={(e) => onPick?.(at(e).i)} onPointerMove={move} onPointerLeave={() => { setHover(null); tip.current?.hide(); }} />
          </svg>
        )}
      </div>
      {/* Подписи оси под волнами: дни недели без них не прочитать. */}
      {W > 0 && n > 1 && (
        <div className="relative mt-1 h-4 text-2xs text-t3" aria-hidden="true">
          {axis.map((a, i) => (
            <span key={i} className="absolute -translate-x-1/2" style={{ left: X(i) }}>{a}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- C: treemap ---------------- */

type Rect = { name: string; group: string; v: number; x: number; y: number; w: number; h: number };
function squarify(items: { name: string; group: string; v: number }[], x: number, y: number, w: number, h: number): Rect[] {
  const total = items.reduce((a, b) => a + b.v, 0) || 1, scale = (w * h) / total, out: Rect[] = [];
  let rest = items.map((i) => ({ ...i, a: i.v * scale }));
  const worst = (row: typeof rest, len: number) => {
    const s = row.reduce((a, b) => a + b.a, 0), mx = Math.max(...row.map((r) => r.a)), mn = Math.min(...row.map((r) => r.a));
    return Math.max((len * len * mx) / (s * s), (s * s) / (len * len * mn));
  };
  while (rest.length) {
    const len = Math.min(w, h);
    const row = [rest[0]];
    let i = 1;
    while (i < rest.length && worst([...row, rest[i]], len) <= worst(row, len)) row.push(rest[i++]);
    rest = rest.slice(i);
    const s = row.reduce((a, b) => a + b.a, 0);
    if (w >= h) { const cw = s / h; let cy = y; for (const r of row) { const rh = r.a / cw; out.push({ ...r, x, y: cy, w: cw, h: rh }); cy += rh; } x += cw; w -= cw; }
    else { const rh = s / w; let cx = x; for (const r of row) { const rw = r.a / rh; out.push({ ...r, x: cx, y, w: rw, h: rh }); cx += rw; } y += rh; h -= rh; }
  }
  return out;
}

function Treemap({ data, period, mono, tip, prefix, shareWord, onPick }: { data: AnalyticsBentoProps["categories"]; period: number; mono: string; tip: TipRef; prefix: string; shareWord: string; onPick?: Pick }) {
  const [ref, { w: W, h: H }] = useSize();
  const [placed, setPlaced] = React.useState(false);
  React.useEffect(() => { if (W) { const r = requestAnimationFrame(() => requestAnimationFrame(() => setPlaced(true))); return () => cancelAnimationFrame(r); } }, [W]);
  const G = 6;
  // Пустые за период плитки не рисуем: у squarify нулевая площадь делит на ноль.
  const items = data.items
    .map((i) => ({ name: i.name, group: i.group, v: i.values[period] ?? 0, ids: i.ids?.[period] ?? [] }))
    .filter((i) => i.v > 0)
    .sort((a, b) => b.v - a.v);
  const total = items.reduce((a, b) => a + b.v, 0) || 1;
  const rects = W && items.length ? squarify(items, 0, 0, W + G, H + G) : [];
  return (
    <div ref={ref} className="relative mt-1.5 min-h-[300px] flex-1 sm:min-h-[360px]" aria-label={`${data.title}, ${data.periods[period]?.label}`}>
      {rects.map((r) => {
        const it = items.find((x) => x.name === r.name)!;
        const g = data.groups.find((x) => x.id === r.group) ?? data.groups[data.groups.length - 1];
        const w = r.w - G, h = r.h - G, share = ((r.v / total) * 100).toFixed(1).replace(/\.0$/, "") + "%";
        // Плитка ничего не обрезает: подпись и сумма подбирают кегль под ширину, а то,
        // что не влезает, просто не рисуется (полностью — в подсказке и по нажатию).
        const pad = w < 70 ? 6 : 12;
        const money = prefix + fmt(r.v);
        const fs = Math.min(30, (w - 2 * pad) / (money.length * 0.6));
        const showMoney = fs >= 11 && h >= 44;
        const showPct = showMoney && w - 2 * pad - money.length * 0.6 * fs >= 52 && h >= 70;
        const nameFs = Math.max(9, Math.min(12, (w - 2 * pad) / (r.name.length * 0.66)));
        const showName = h >= 22 && w >= 22 && r.name.length * 0.66 * nameFs <= w - 2 * pad + 1;
        // Буквальные цвета: text-white на светлой теме перекрашивается в почти чёрный.
        const ink = g.ink === "light" ? "text-[#fff]" : "text-[#111318]";
        return (
          <button
            type="button"
            key={r.name}
            onClick={() => onPick?.(`${r.name} · ${data.periods[period]?.label}`, it.ids)}
            className={`absolute flex flex-col justify-between overflow-hidden rounded-[12px] text-left outline-none transition-[left,top,width,height,filter] duration-700 [transition-timing-function:cubic-bezier(.2,.9,.25,1)] hover:brightness-[1.08] focus-visible:ring-2 focus-visible:ring-haul-400 motion-reduce:transition-none ${ink}`}
            style={{
              left: placed ? r.x : W / 2, top: placed ? r.y : H / 2, width: placed ? w : 0, height: placed ? h : 0,
              background: g.color, padding: pad,
            }}
            onPointerMove={(e) => tip.current?.show(e.clientX, e.clientY, { title: `${data.periods[period]?.label} · ${g.name}`, rows: [{ label: r.name, value: money, color: g.color }, { label: shareWord, value: share }] })}
            onPointerLeave={() => tip.current?.hide()}
          >
            {showName && (
              <span className="block whitespace-nowrap font-semibold uppercase leading-none tracking-[0.03em]" style={{ fontSize: nameFs }}>{r.name}</span>
            )}
            {showMoney && (
              <span className="flex items-end justify-between gap-1.5">
                <span className="whitespace-nowrap font-medium leading-[.9] tracking-[-0.04em]" style={{ fontFamily: mono, fontSize: fs, fontVariantNumeric: "tabular-nums" }}>
                  <CountUp value={r.v} prefix={prefix} duration={900} />
                </span>
                {showPct && (
                  <span className="rounded-md bg-black/80 px-[5px] py-[3px] text-2xs font-medium tracking-[-0.02em] text-[#fff]" style={{ fontFamily: mono }}>{share}</span>
                )}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- D: seasonality radar ---------------- */

function Radar({ values, axis, year, color, prefix, mono, tip, word, onPick }: { values: number[]; axis: string[]; year: string; color: string; prefix: string; mono: string; tip: TipRef; word: string; onPick?: (i: number) => void }) {
  const [ref, { w }] = useSize();
  const reduce = useReducedMotion();
  const line = React.useRef(null as SVGPathElement | null);
  const cur = React.useRef(null as number[] | null);
  const [hover, setHover] = React.useState(null as number | null);
  const N = values.length, S = Math.min(w, 340), R = S / 2 - 34, C = S / 2;
  const ang = (i: number) => -Math.PI / 2 + (i / N) * Math.PI * 2;

  /* a low-order Fourier fit keeps the lobes round and even */
  const norm = (v: number[]) => { const lo = Math.min(...v), hi = Math.max(...v); return v.map((x) => 0.42 + ((x - lo) / (hi - lo || 1)) * 0.58); };
  const fit = (v: number[]) => {
    const K = Math.min(5, Math.floor(N / 2)), co: [number, number][] = [];
    for (let k = 0; k <= K; k++) {
      let a = 0, b = 0;
      v.forEach((x, i) => { const th = (i / N) * Math.PI * 2; a += x * Math.cos(k * th); b += x * Math.sin(k * th); });
      co.push([(a * (k ? 2 : 1)) / N, (b * (k ? 2 : 1)) / N]);
    }
    return (th: number) => co.reduce((r, [a, b], k) => r + a * Math.cos(k * th) + b * Math.sin(k * th), 0);
  };
  const at = (f: (t: number) => number, th: number): [number, number] => {
    const v = Math.max(0.05, f(th)), a = -Math.PI / 2 + th;
    return [C + Math.cos(a) * (R * 0.2 + v * R * 0.8), C + Math.sin(a) * (R * 0.2 + v * R * 0.8)];
  };
  const shape = (v: number[]) => { const f = fit(norm(v)); let d = ""; for (let j = 0; j <= 180; j++) { const p = at(f, (j / 180) * Math.PI * 2); d += (j ? "L" : "M") + p[0].toFixed(2) + "," + p[1].toFixed(2); } return d + "Z"; };
  const point = (v: number[], i: number) => at(fit(norm(v)), (i / N) * Math.PI * 2);

  React.useEffect(() => {
    if (!S) return;
    const from = cur.current ?? values.map(() => 1), to = values, t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = reduce ? 1 : ease(Math.min(1, (now - t0) / 900));
      cur.current = from.map((v, i) => v + (to[i] - v) * t);
      line.current?.setAttribute("d", shape(cur.current));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, S, reduce]);

  const monthAt = (e: { clientX: number; clientY: number; currentTarget: EventTarget }) => {
    const r = (e.currentTarget as SVGRectElement).ownerSVGElement!.getBoundingClientRect(), x = e.clientX - r.left - C, y = e.clientY - r.top - C;
    if (Math.hypot(x, y) < R * 0.2) return null;
    let a = Math.atan2(y, x) + Math.PI / 2; if (a < 0) a += Math.PI * 2;
    return { r, i: Math.round((a / (Math.PI * 2)) * N) % N };
  };
  const move = (e: React.PointerEvent) => {
    const m = monthAt(e);
    if (!m) { setHover(null); tip.current?.hide(); return; }
    const { r, i } = m, p = point(values, i);
    setHover(i);
    tip.current?.show(r.left + p[0], r.top + p[1], { title: `${axis[i]} ${year}`, rows: [{ label: word, value: prefix + fmt(values[i]), color }] });
  };
  const hp = hover !== null ? point(values, hover) : null;

  return (
    <div ref={ref} className="mx-auto mt-1.5 w-full max-w-[340px]" style={{ height: S || 300 }}>
      {S > 0 && (
        <svg width={S} height={S} className="mx-auto block" role="img" aria-label={`${word}, ${year}`}>
          {[0.33, 0.66, 1].map((k) => <circle key={k} cx={C} cy={C} r={R * k} fill="none" className="stroke-white/10" strokeWidth={1} />)}
          {axis.map((m, i) => (
            <g key={m}>
              <line x1={C + Math.cos(ang(i)) * R * 0.2} y1={C + Math.sin(ang(i)) * R * 0.2} x2={C + Math.cos(ang(i)) * R} y2={C + Math.sin(ang(i)) * R} className="stroke-white/10" strokeWidth={1} />
              <text x={C + Math.cos(ang(i)) * (R + 18)} y={C + Math.sin(ang(i)) * (R + 18)} textAnchor="middle" dominantBaseline="central" fontSize={11} className="fill-t3" style={{ fontFamily: mono }}>{m}</text>
            </g>
          ))}
          <path ref={line} fill="none" strokeWidth={2.5} strokeLinejoin="round" style={{ stroke: color }} />
          <circle cx={C} cy={C} r={R * 0.2} className="fill-ink-900 stroke-white/10" strokeWidth={1} />
          <g transform={`translate(${C - 11} ${C - 11})`} fill="none" className="stroke-t3" strokeWidth={1.4} strokeLinejoin="round">
            <path d="M11 1.5l8.5 5v9L11 20.5l-8.5-5v-9z M11 1.5v19 M2.5 6.5L19.5 15.5 M19.5 6.5L2.5 15.5" />
          </g>
          {hp && <circle cx={hp[0]} cy={hp[1]} r={4.5} className="stroke-ink-900" strokeWidth={2} style={{ fill: color }} />}
          <rect width={S} height={S} fill="transparent" className={onPick ? "cursor-pointer" : undefined} onClick={(e) => { const m = monthAt(e); if (m) onPick?.(m.i); }} onPointerMove={move} onPointerLeave={() => { setHover(null); tip.current?.hide(); }} />
        </svg>
      )}
    </div>
  );
}

/* ---------------- the bento ---------------- */

/** Строка-кнопка: подсвечивается и ведёт к списку грузов, если за ней есть грузы. */
function RowButton({ ids, title, onPick, className = "", children }: { ids?: number[]; title: string; onPick?: Pick; className?: string; children: React.ReactNode }) {
  const live = !!onPick && !!ids?.length;
  if (!live) return <div className={className}>{children}</div>;
  return (
    <button type="button" onClick={() => onPick!(title, ids!)} className={`w-full text-left outline-none transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-haul-400 ${className}`}>
      {children}
    </button>
  );
}

export function AnalyticsBento({
  currency = "$",
  revenue,
  sessions,
  categories,
  seasonality,
  labels,
  onOpenLoads,
  colors = {},
  fontFamily = "var(--font-sans)",
  monoFamily = "var(--font-nums)",
  className = "",
  style,
  ...rest
}: AnalyticsBentoProps) {
  const tip = React.useRef(null as TipApi | null) as TipRef;
  const [period, setPeriod] = React.useState(1);
  const [year, setYear] = React.useState(0);
  const [shown, setShown] = React.useState(false);
  React.useEffect(() => { const r = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(r); }, []);

  // Акцент берём из темы: «Вид» перекрашивает haul-* (оранжевый, фиолетовый, синий).
  const c = {
    revenue: colors.revenue ?? ["var(--color-haul-400)", "var(--color-haul-500)"],
    desktop: colors.desktop ?? ["var(--color-haul-400)", "var(--color-haul-500)"],
    mobile: colors.mobile ?? ["#22D3EE", "#0ea5e9"],
    radar: colors.radar ?? "var(--color-haul-500)",
  } as const;
  const mono: React.CSSProperties = { fontFamily: monoFamily, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.04em" };
  const Y = seasonality.years[year];
  const axis = seasonality.axis ?? ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const sl = { desktop: "", mobile: "", prior: "", current: "", ...sessions.labels };
  const enter = (i: number) =>
    `transition-[opacity,transform] duration-1000 [transition-timing-function:cubic-bezier(.2,.9,.25,1)] motion-reduce:transition-none ${shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3.5"} ` +
    ["", "delay-75", "delay-150", "delay-200"][i];
  const pickIds = (title: string, ids?: number[]) => { if (ids?.length) onOpenLoads?.(title, ids); };

  return (
    <div className={`w-full text-t1 ${className}`} style={{ fontFamily, ...style }} {...rest}>
      <div className="grid grid-cols-12 gap-4">
        {/* revenue */}
        <Card className={`col-span-12 flex flex-col gap-4 lg:col-span-7 ${enter(0)}`} aria-label={revenue.label}>
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
            <div>
              <div className="text-sm tracking-[-0.01em] text-t3">{revenue.label}</div>
              <div className="mt-2 text-3xl font-medium leading-none" style={mono}>
                <CountUp value={revenue.value} prefix={currency} />
                <Delta className="ml-2.5 align-[6px] text-sm">{revenue.delta}</Delta>
              </div>
            </div>
            {revenue.note && <div className="text-sm tracking-[-0.01em] text-t3">{revenue.note}</div>}
          </div>
          <RevenueChart
            series={revenue.series}
            caption={revenue.caption}
            prefix={currency}
            colors={c.revenue as [string, string]}
            mono={monoFamily}
            tip={tip}
            word={labels.revenue}
            onPick={onOpenLoads ? (i) => pickIds(revenue.series[i].label, revenue.series[i].ids) : undefined}
          />
        </Card>

        {/* sessions */}
        <Card className={`col-span-12 flex flex-col gap-4 lg:col-span-5 ${enter(1)}`} aria-label={sessions.label}>
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
            <div>
              <div className="text-sm tracking-[-0.01em] text-t3">{sessions.label}</div>
              <div className="mt-2 text-3xl font-medium leading-none" style={mono}>
                <CountUp value={sessions.value} />
                <Delta className="ml-2.5 align-[6px] text-sm">{sessions.delta}</Delta>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-xs tracking-[-0.01em] text-t3">
              <span className="inline-flex items-center gap-1.5"><i className="h-0.5 w-3.5 rounded-sm" style={{ background: `linear-gradient(90deg,${c.desktop[0]},${c.desktop[1]})` }} />{sl.desktop}</span>
              <span className="inline-flex items-center gap-1.5"><i className="h-0.5 w-3.5 rounded-sm" style={{ background: `linear-gradient(90deg,${c.mobile[0]},${c.mobile[1]})` }} />{sl.mobile}</span>
              {(sessions.desktop.length > 1 || sessions.mobile.length > 1) && <span className="inline-flex items-center gap-1.5"><i className="h-0.5 w-3.5 rounded-sm bg-t3/50" />{sl.prior}</span>}
            </div>
          </div>
          <SessionsChart
            desktop={sessions.desktop}
            mobile={sessions.mobile}
            axis={sessions.axis}
            labels={sl}
            colors={{ desktop: [...c.desktop] as [string, string], mobile: [...c.mobile] as [string, string] }}
            tip={tip}
            onPick={onOpenLoads ? (i) => pickIds(`${sessions.axis[i]} · ${sl.current}`, sessions.ids?.[i]) : undefined}
          />
        </Card>

        {/* categories */}
        <Card className={`col-span-12 flex flex-col lg:col-span-7 ${enter(2)}`} aria-label={categories.title}>
          <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
            <h2 className="m-0 shrink-0 text-lg font-semibold tracking-[-0.02em]">{categories.title}</h2>
            <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-xs tracking-[-0.01em] text-t3 sm:justify-end">
              {categories.groups.map((g) => (
                <span key={g.id} className="inline-flex items-center gap-1.5"><i className="size-2 rounded-[2px]" style={{ background: g.color }} />{g.name}</span>
              ))}
            </div>
          </div>
          <div role="tablist" className="my-4 grid grid-cols-3 gap-1.5 rounded-[14px] bg-white/5 p-1">
            {categories.periods.map((p, i) => (
              <button
                key={p.label}
                type="button"
                role="tab"
                aria-selected={i === period}
                onClick={() => setPeriod(i)}
                className={`min-w-0 rounded-[10px] px-2.5 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-haul-400 ${i === period ? "bg-ink-900 shadow-e1 ring-1 ring-white/10" : "hover:bg-white/5"}`}
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold tracking-[-0.01em] text-t2">
                  <i className={`size-1.5 rounded-full transition-colors ${i === period ? "bg-haul-500" : "bg-t3/60"}`} />
                  {p.label}
                  <span className="ml-auto hidden sm:inline"><Delta className="text-2xs">{p.delta}</Delta></span>
                </div>
                <div className="mt-1 whitespace-nowrap text-base font-medium leading-none sm:text-xl" style={mono}>
                  <CountUp value={p.total} prefix={currency} />
                </div>
                <div className="mt-1 hidden truncate text-2xs tracking-[-0.01em] text-t3 sm:block">{p.compare}</div>
              </button>
            ))}
          </div>
          <Treemap data={categories} period={period} mono={monoFamily} tip={tip} prefix={currency} shareWord={labels.share} onPick={onOpenLoads ? pickIds : undefined} />
          {categories.table && categories.table.rows.length > 0 && (
            <div className="mt-4 text-sm">
              <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,5.5rem))] gap-2 px-2 pb-1.5 text-xs font-medium text-t3">
                {categories.table.columns.map((h, i) => <span key={h} className={i ? "text-right" : ""}>{h}</span>)}
              </div>
              {categories.table.rows.map((r) => (
                <RowButton key={r.label} ids={r.ids} title={r.label} onPick={onOpenLoads} className="grid grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,5.5rem))] items-center gap-2 rounded-lg border-t border-white/10 px-2 py-2.5">
                  <span className="truncate tracking-[-0.01em] text-t2">{r.label}</span>
                  {r.values.map((v, i) => <span key={i} className="text-right" style={mono}>{v}</span>)}
                </RowButton>
              ))}
            </div>
          )}
        </Card>

        {/* seasonality */}
        <Card className={`col-span-12 flex flex-col lg:col-span-5 ${enter(3)}`} aria-label={seasonality.title}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="m-0 text-lg font-semibold tracking-[-0.02em]">{seasonality.title}</h2>
            {seasonality.years.length > 1 && <Segmented label={labels.year} items={seasonality.years.map((y) => y.label)} value={year} onChange={setYear} />}
          </div>
          {Y && (
            <>
              <Radar
                values={Y.values}
                axis={axis}
                year={Y.label}
                color={c.radar}
                prefix={currency}
                mono={monoFamily}
                tip={tip}
                word={labels.value}
                onPick={onOpenLoads ? (i) => pickIds(`${axis[i]} ${Y.label}`, Y.ids?.[i]) : undefined}
              />
              {/* Месяцы полосками: тот же год, но читается без наведения и нажимается. */}
              <div className="mt-2 grid grid-cols-12 items-end gap-1" style={{ height: 64 }}>
                {Y.values.map((v, i) => {
                  const max = Math.max(1, ...Y.values);
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={!Y.ids?.[i]?.length}
                      onClick={() => pickIds(`${axis[i]} ${Y.label}`, Y.ids?.[i])}
                      title={`${axis[i]} ${Y.label}: ${currency}${fmt(v)}`}
                      className="flex h-full flex-col justify-end rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-haul-400 enabled:hover:opacity-80"
                    >
                      <span className="block w-full rounded-sm bg-haul-500" style={{ height: `${Math.max(v ? 6 : 2, (v / max) * 100)}%`, opacity: v ? 1 : 0.25 }} />
                    </button>
                  );
                })}
              </div>
              <div className="mt-1 grid grid-cols-12 gap-1 text-center text-2xs text-t3" aria-hidden="true">
                {axis.map((m) => <span key={m} className="truncate">{m}</span>)}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {Y.stats.map((s) => (
                  <div key={s.label} className="min-w-0">
                    <div className="text-sm tracking-[-0.01em] text-t3">{s.label}</div>
                    <div className="mt-1.5 truncate text-2xl font-medium leading-none" style={mono}><CountUp value={s.value} prefix={currency} /></div>
                    <div className="mt-1.5 text-xs text-t3"><Delta className="mr-1.5">{s.delta}</Delta><span style={mono}>{s.note}</span></div>
                  </div>
                ))}
              </div>
              <div className="mt-3">
                {Y.rows.map((r) => (
                  <RowButton key={r.label} ids={r.ids} title={`${r.label} · ${Y.label}`} onPick={onOpenLoads} className="flex justify-between gap-3 rounded-lg border-t border-white/10 px-2 py-2.5 text-sm">
                    <span className="min-w-0 truncate tracking-[-0.01em] text-t2">{r.label}</span>
                    <span style={mono}>{r.value}</span>
                  </RowButton>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>
      <Tooltip api={tip} mono={monoFamily} />
    </div>
  );
}

export default AnalyticsBento;
