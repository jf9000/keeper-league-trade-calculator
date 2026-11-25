import { useId } from 'react'

interface Props {
  /** Accessible name for the icon. */
  label: string
  /** What the bubble says. */
  text: string
}

/**
 * An (i) icon that shows `text` in a small bubble on hover or keyboard focus (a tap focuses it on phones). The bubble
 * fades and rises into place, and just fades for people who prefer reduced motion.
 */
export function HintTip({ label, text }: Props) {
  const id = useId()
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-describedby={id}
        className="!inline-flex !h-4 !w-4 shrink-0 items-center justify-center !rounded-full !border-0 !bg-transparent !p-0 text-mut transition-colors hover:text-ac focus-visible:text-ac"
      >
        <svg viewBox="0 0 24 24" className="h-full w-full" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 11v6" />
          <path d="M12 7.2v.01" strokeWidth="2.6" />
        </svg>
      </button>
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none absolute top-full left-0 z-20 mt-2 w-max max-w-[min(16rem,60vw)] origin-top-left translate-y-1 scale-95 rounded-lg border border-bd bg-card px-3 py-2 text-[13px] leading-snug text-tx opacity-0 shadow-xl transition duration-200 ease-out group-focus-within:translate-y-0 group-focus-within:scale-100 group-focus-within:opacity-100 group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100 motion-reduce:translate-y-0 motion-reduce:scale-100 motion-reduce:transition-opacity"
      >
        {text}
      </span>
    </span>
  )
}
