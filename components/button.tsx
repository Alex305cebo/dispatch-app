// The app's one button. Before this, ~90 <button>/<Link> controls across 38 files each
// carried their own hand-written className, so nothing was consistent: some had a hover
// state, almost none had a pressed state, and "disabled" usually meant nothing more
// than the browser's default washed-out grey. That is why the UI read as static — you
// could not tell by looking whether a control was live, busy, or off.
//
// Deliberately NOT marked 'use client': it holds no state and no handlers of its own,
// so a Server Component can render the <Link> form with zero JS, while a Client
// Component passing onClick just pulls it into its own bundle.

import Link from 'next/link'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const BASE = [
  'relative inline-flex select-none items-center justify-center gap-1.5',
  'font-semibold whitespace-nowrap rounded-xl border',
  // The press itself. Duration is short on purpose: past ~120ms a button stops
  // feeling like a physical key and starts feeling laggy.
  'transition-[transform,background-color,border-color,box-shadow,color] duration-[120ms] ease-out',
  'active:translate-y-px active:scale-[0.98]',
  // Keyboard focus has to be visible without turning every mouse click into a ring.
  'outline-none focus-visible:ring-2 focus-visible:ring-haul-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950',
  // One rule for both "off" and "busy": no pointer, no press, dimmed — so a disabled
  // control can never look merely decorative.
  'disabled:pointer-events-none disabled:opacity-45 disabled:active:translate-y-0 disabled:active:scale-100',
  'aria-disabled:pointer-events-none aria-disabled:opacity-45',
].join(' ')

const VARIANTS: Record<Variant, string> = {
  // Filled accent. The inset top highlight is what makes it read as a raised key
  // rather than a flat rectangle, and it inverts on :active so the button visibly
  // sinks instead of just changing colour.
  primary: [
    'border-haul-400/30 bg-haul-500 text-white',
    'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.22),0_2px_8px_-2px_rgba(109,90,232,0.55)]',
    'hover:bg-haul-400 hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.28),0_4px_14px_-2px_rgba(109,90,232,0.65)]',
    'active:bg-haul-600 active:shadow-[inset_0_2px_5px_0_rgba(0,0,0,0.45)]',
  ].join(' '),
  secondary: [
    'border-white/10 bg-white/[0.06] text-white',
    'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.07),0_1px_2px_0_rgba(0,0,0,0.35)]',
    'hover:border-white/20 hover:bg-white/[0.10]',
    'active:bg-white/[0.04] active:shadow-[inset_0_2px_4px_0_rgba(0,0,0,0.4)]',
  ].join(' '),
  ghost: 'border-transparent bg-transparent text-white/70 hover:bg-white/[0.07] hover:text-white active:bg-white/[0.03]',
  // Destructive actions get the status red, never the accent — deleting a load must
  // not look like the same kind of act as creating one.
  danger: [
    'border-bad-400/30 bg-bad-500 text-white',
    'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.20),0_2px_8px_-2px_rgba(240,53,61,0.5)]',
    'hover:bg-bad-400',
    'active:shadow-[inset_0_2px_5px_0_rgba(0,0,0,0.45)]',
  ].join(' '),
}

const SIZES: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-xs',
  md: 'h-9 px-3.5 text-base',
  lg: 'h-11 px-5 text-md',
}

/** Ring-shaped spinner. Pure CSS rotation — nothing to hydrate, works in a Server
 * Component, and keeps spinning even while the main thread is busy submitting. */
function Spinner() {
  return (
    <span
      aria-hidden
      className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent opacity-80"
    />
  )
}

type CommonProps = {
  children?: React.ReactNode
  variant?: Variant
  size?: Size
  /** Swaps the leading icon for a spinner and blocks interaction. */
  loading?: boolean
  /** Stretch to the container — forms on phones. */
  block?: boolean
  icon?: React.ReactNode
  className?: string
}

/** Renders a plain <a> instead of next/link. Needed whenever the target is NOT a page:
 * a Route Handler that sets a cookie and redirects (/demo), a file download, or an
 * off-site link. Client-side navigation would fetch those as RSC payloads and never
 * give the browser the full page load they depend on. */
type ExternalFlag = { external?: boolean }

type ButtonProps = CommonProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof CommonProps> & { href?: undefined }

type LinkProps = CommonProps &
  ExternalFlag &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof CommonProps> & { href: string }

export function Button(props: ButtonProps | LinkProps) {
  const {
    children,
    variant = 'secondary',
    size = 'md',
    loading = false,
    block = false,
    icon,
    className = '',
    ...rest
  } = props

  const cls = [BASE, VARIANTS[variant], SIZES[size], block ? 'w-full' : '', className]
    .filter(Boolean)
    .join(' ')

  // aria-busy, not just a spinner: a screen reader otherwise announces an unchanged
  // label while the action is still in flight.
  const body = (
    <>
      {loading ? <Spinner /> : icon}
      {children}
    </>
  )

  if ('href' in rest && rest.href !== undefined) {
    const { href, external, ...anchor } = rest as LinkProps
    if (external)
      return (
        <a href={href} className={cls} aria-busy={loading || undefined} {...anchor}>
          {body}
        </a>
      )
    return (
      <Link href={href} className={cls} aria-busy={loading || undefined} {...anchor}>
        {body}
      </Link>
    )
  }

  const { disabled, type, ...button } = rest as ButtonProps
  return (
    <button
      type={type ?? 'button'}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cls}
      {...button}
    >
      {body}
    </button>
  )
}
