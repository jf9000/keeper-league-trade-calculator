import { useId, useRef, useState, type ReactNode } from 'react'

/** Shared style for body text inside an info dialog. */
export const p = 'm-0 text-[13px] leading-relaxed text-mut'

/** A titled block of text that starts collapsed and opens smoothly when its heading is clicked. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const bodyId = useId()
  return (
    <section className="border-b border-bd last:border-b-0">
      <h3 className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((o) => !o)}
          className="group !flex w-full items-center justify-between gap-3 !rounded-lg !border-0 !bg-transparent !px-2 !py-3.5 text-left text-base font-bold text-tx hover:!bg-chip"
        >
          {title}
          <svg
            viewBox="0 0 24 24"
            className={`h-4 w-4 shrink-0 text-mut transition-[transform,color] duration-300 group-hover:text-ac group-focus-visible:text-ac motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </h3>
      {/* Animating grid rows from 0fr to 1fr lets the height follow the content without measuring it. */}
      <div
        id={bodyId}
        inert={!open}
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div className="px-2 pb-4">{children}</div>
        </div>
      </div>
    </section>
  )
}

interface Props {
  /** Tooltip and accessible name for the icon button. */
  label: string
  /** Heading shown at the top of the modal. */
  title: string
  /** A smaller icon, for sitting beside a form label rather than a page title. */
  small?: boolean
  children: ReactNode
}

/** An (i) icon that shows `label` as a tooltip and opens a modal with `children` when clicked. */
export function InfoDialog({ label, title, small = false, children }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  return (
    <>
      <button
        type="button"
        aria-label={label}
        title={label}
        className={`!inline-flex shrink-0 items-center justify-center !rounded-full !border-0 !bg-transparent !p-0 text-mut hover:text-ac ${
          small ? '!h-4 !w-4' : '!h-5 !w-5'
        }`}
        onClick={() => dialog.current?.showModal()}
      >
        {/* Outlined circle with an outlined "i": nothing is filled, so it takes the text color and stays light. */}
        <svg viewBox="0 0 24 24" className="h-full w-full" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 11v6" />
          <path d="M12 7.2v.01" strokeWidth="2.6" />
        </svg>
      </button>

      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        className="m-auto max-h-[85vh] w-[min(640px,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-bd bg-card p-0 text-tx backdrop:bg-black/50"
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close()
        }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-bd bg-card px-5 py-3">
          <h2 id={titleId} className="m-0 text-lg font-bold">
            {title}
          </h2>
          <button
            type="button"
            aria-label="Close"
            title="Close"
            className="!inline-flex shrink-0 items-center justify-center !h-9 !w-9 !rounded-full !border-0 !bg-chip !p-0 text-mut transition-colors hover:!bg-ac hover:!text-white focus-visible:!bg-ac focus-visible:!text-white active:scale-95"
            onClick={() => dialog.current?.close()}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="px-3 py-2">{children}</div>
      </dialog>
    </>
  )
}
