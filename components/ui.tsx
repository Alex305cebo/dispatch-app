'use client'

import { useEffect } from 'react'
import { motion, useSpring, useTransform } from 'motion/react'
import { usd } from '@/lib/fmt'
import { Info } from '@/components/info'

export const SPRING = { stiffness: 170, damping: 26, mass: 0.6 }

export function Money({ value, format = usd }: { value: number; format?: Intl.NumberFormat }) {
  const spring = useSpring(value, SPRING)
  useEffect(() => spring.set(value), [spring, value])
  const text = useTransform(spring, (v) => format.format(v))
  return <motion.span>{text}</motion.span>
}

export function Field({
  label,
  value,
  onChange,
  step = 1,
  prefix,
  suffix,
  big,
  missing,
  name,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  step?: number
  prefix?: string
  suffix?: string
  big?: boolean
  /** Amber ring: the QR didn't carry this — the dispatcher has to supply it. */
  missing?: boolean
  name?: string
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-white/65">
        {label}
      </span>
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/55">
            {prefix}
          </span>
        )}
        <input
          type="number"
          inputMode="decimal"
          step={step}
          name={name}
          value={Number.isNaN(value) ? '' : value}
          onChange={(e) => onChange(e.target.valueAsNumber)}
          className={[
            'nums w-full rounded-xl border bg-ink-900/80 py-2.5 text-white',
            'transition-all duration-200 outline-none',
            'hover:border-white/15 focus:border-haul-500 focus:bg-ink-900 focus:ring-4 focus:ring-haul-500/15',
            missing ? 'border-amber-400/50 ring-2 ring-amber-400/20' : 'border-white/8',
            prefix ? 'pl-7' : 'pl-3',
            suffix ? 'pr-12' : 'pr-3',
            big ? 'text-2xl font-semibold' : 'text-[15px]',
          ].join(' ')}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/55">
            {suffix}
          </span>
        )}
      </div>
    </label>
  )
}

export function TextField({
  label,
  value,
  onChange,
  name,
  placeholder,
}: {
  label: string
  value: string
  onChange: (s: string) => void
  name?: string
  placeholder?: string
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-white/65">
        {label}
      </span>
      <input
        type="text"
        name={name}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-white/8 bg-ink-900/80 px-3 py-2.5 text-[15px] text-white outline-none transition-all duration-200 placeholder:text-white/45 hover:border-white/15 focus:border-haul-500 focus:bg-ink-900 focus:ring-4 focus:ring-haul-500/15"
      />
    </label>
  )
}

export function CostBar({
  label,
  amount,
  gross,
  color,
  hint,
}: {
  label: string
  amount: number
  gross: number
  color: string
  /** Short explanation of what this cost is and what drives it. */
  hint?: string
}) {
  const pct = gross > 0 ? Math.min(100, (amount / gross) * 100) : 0
  return (
    <div className="py-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex items-center gap-1 text-[13px] text-white/78">
          {label}
          {hint && <Info text={hint} />}
        </span>
        <span className="nums text-[13px] text-white/90">−{usd.format(amount)}</span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/6">
        <motion.div
          className={`h-full rounded-full ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', ...SPRING }}
        />
      </div>
    </div>
  )
}
