import { useId, useState, type ReactNode } from 'react'
import { LIMITS } from '../lib/valuation'
import type { Scoring, Settings } from '../types'
import { Chevron, Collapsible } from './Collapsible'
import { CheckboxField } from './CheckboxField'
import { NumberField } from './NumberField'

interface Props {
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
  /** Whether the card is expanded; the app remembers it so it stays put as you move between tabs. */
  open: boolean
  onToggle: (open: boolean) => void
  /** Sits before the settings pill, on the same row. */
  leading?: ReactNode
}

const SCORING_LABEL: Record<Scoring, string> = { ppr: 'PPR', half: 'Half PPR', std: 'No PPR' }

/**
 * League settings. Shown on every tab, since they change every number in the app. Collapsed it is a pill that sums
 * them up; the pill opens the full set below.
 */
export function SettingsCard({ settings: s, onChange, open, onToggle, leading }: Props) {
  const [extra, setExtra] = useState(false)
  const bodyId = useId()
  const extraId = useId()
  const summary = [`${s.teams} teams`, SCORING_LABEL[s.scoring], `${s.keepers} keeper${s.keepers === 1 ? '' : 's'}`, s.superflex ? 'Superflex' : null]
    .filter(Boolean)
    .join(' · ')
  return (
    <section aria-label="League" className="mb-4">
      <div className="flex flex-wrap items-center gap-2">
        {leading}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => onToggle(!open)}
          className="group flex max-w-full items-center gap-2 rounded-full px-3.5 py-1.5 text-left text-sm"
        >
          <span className="shrink-0 font-semibold">Settings</span>
          <span className="min-w-0 text-mut">{summary}</span>
          <Chevron open={open} />
        </button>
      </div>
      <Collapsible open={open} id={bodyId}>
        <div className="pt-3 pb-1">
          <div className="card p-4">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,120px),1fr))] gap-3">
              <NumberField label="League size" value={s.teams} {...LIMITS.teams} onChange={(teams) => onChange({ teams })} />
              <NumberField label="Keepers" value={s.keepers} {...LIMITS.keepers} onChange={(keepers) => onChange({ keepers })} />
              <NumberField label="Draft rounds" value={s.rounds} {...LIMITS.rounds} onChange={(rounds) => onChange({ rounds })} />
              <NumberField label="Flex spots" value={s.flex} {...LIMITS.flex} onChange={(flex) => onChange({ flex })} />
              <label className="flex flex-col gap-1 text-[13px] text-mut">
                Scoring
                <select className="h-[34px] py-0" value={s.scoring} onChange={(e) => onChange({ scoring: e.target.value as Scoring })}>
                  <option value="ppr">PPR</option>
                  <option value="half">Half PPR</option>
                  <option value="std">No PPR</option>
                </select>
              </label>
              <CheckboxField label="Superflex" checked={s.superflex} onChange={(superflex) => onChange({ superflex })} />
            </div>

            <div className="mt-4 border-t border-bd pt-3">
              <button
                type="button"
                aria-expanded={extra}
                aria-controls={extraId}
                onClick={() => setExtra((o) => !o)}
                className="group flex w-full items-center justify-between gap-3 border-0 bg-transparent p-0 py-1 text-left text-sm font-semibold"
              >
                Additional settings
                <Chevron open={extra} />
              </button>
              <Collapsible open={extra} id={extraId}>
                <div className="mt-1.5 flex">
                  <CheckboxField fit label="Keep only 1 QB" checked={s.oneQb} onChange={(oneQb) => onChange({ oneQb })} />
                </div>
              </Collapsible>
            </div>
          </div>
        </div>
      </Collapsible>
    </section>
  )
}
