import { faCircleInfo } from '@fortawesome/free-solid-svg-icons/faCircleInfo'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useId, useRef, type ReactNode } from 'react'

/** Shared styles for the headings and text inside an info dialog. */
export const h3 = 'mt-4 mb-1 text-sm font-semibold'
export const p = 'm-0 text-[13px] leading-relaxed text-mut'

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
          small ? '!h-4 !w-4' : '!h-6 !w-6'
        }`}
        onClick={() => dialog.current?.showModal()}
      >
        <FontAwesomeIcon icon={faCircleInfo} size={small ? 'sm' : 'lg'} aria-hidden="true" />
      </button>

      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        className="m-auto max-h-[85vh] w-[min(640px,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-bd bg-card p-0 text-tx backdrop:bg-black/50"
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close()
        }}
      >
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 id={titleId} className="m-0 text-lg font-bold">
              {title}
            </h2>
            <button type="button" aria-label="Close" className="shrink-0 !px-2 !py-0.5" onClick={() => dialog.current?.close()}>
              ✕
            </button>
          </div>
          {children}
        </div>
      </dialog>
    </>
  )
}
