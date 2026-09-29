// Rate per mile рядом с суммой груза: «$2.85/mi». Одна на приложение, чтобы RPM везде
// считался одинаково — ставка ÷ все мили груза (груженые + порожние), без оценок —
// и не появлялся там, где миль нет (0 миль — не «$∞/mi», а ничего).

import { usd2 } from '@/lib/fmt'

export function rpmText(rate: number, miles: number): string | null {
  return miles > 0 && rate > 0 ? `${usd2.format(rate / miles)}/mi` : null
}

export function Rpm({ rate, miles, className = 'text-t3' }: { rate: number; miles: number; className?: string }) {
  const text = rpmText(rate, miles)
  return text ? <span className={`nums ${className}`}>{text}</span> : null
}
