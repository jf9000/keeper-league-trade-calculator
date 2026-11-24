import { useId, useState } from 'react'
import { LIMITS } from '../lib/valuation'
import type { Scoring, Settings } from '../types'
import { Chevron, Collapsible } from './Collapsible'
import { CheckboxField } from './CheckboxField'
import { NumberField } from './NumberField'
import { WinNowSlider } from './WinNowSlider'

interface Props {
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
  /** Whether the card is expanded; the app remembers it so it stays put as you move between tabs. */
  open: boolean
  onToggle: (open: boolean) => void
}

/** League settings and the win-now slider. Shown on every tab, since they change every number in the app. */
export function SettingsCard({ settings: s, onChange, open, onToggle }: Props) {
  const [extra, setExtra] = useState(false)
  const bodyId = useId()
  const extraId = useId()
  const toggle = 'group flex w-full items-center justify-between gap-3 !border-0 !bg-transparent !p-0 py-1 text-left font-semibold'
  return (
    <section className="mb-4 rounded-xl border border-bd bg-card p-4">
      <button type="button" aria-expanded={open} aria-controls={bodyId} onClick={() => onToggle(!open)} className={`!flex ${toggle}`}>
        League settings
        <Chevron open={open} />
      </button>
      <Collapsible open={open} id={bodyId}>
      <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(min(100%,120px),1fr))] gap-3">
        <NumberField label="League size" value={s.teams} {...LIMITS.teams} onChange={(teams) => onChange({ teams })} />
        <NumberField label="Keepers" value={s.keepers} {...LIMITS.keepers} onChange={(keepers) => onChange({ keepers })} />
        <NumberField label="Draft rounds" value={s.rounds} {...LIMITS.rounds} onChange={(rounds) => onChange({ rounds })} />
        <NumberField label="Flex spots" value={s.flex} {...LIMITS.flex} onChange={(flex) => onChange({ flex })} />
        <label className="flex flex-col gap-1 text-[13px] text-mut">
          Scoring
          <select className="h-[34px]" value={s.scoring} onChange={(e) => onChange({ scoring: e.target.value as Scoring })}>
            <option value="ppr">PPR</option>
            <option value="half">Half PPR</option>
            <option value="std">No PPR</option>
          </select>
        </label>
        <CheckboxField label="Superflex" checked={s.superflex} onChange={(superflex) => onChange({ superflex })} />
      </div>

      <div className="mt-4 border-t border-bd pt-4">
        <WinNowSlider value={s.redraftWeight} onChange={(redraftWeight) => onChange({ redraftWeight })} />
      </div>

      <div className="mt-4 border-t border-bd pt-3">
        <button type="button" aria-expanded={extra} aria-controls={extraId} onClick={() => setExtra((o) => !o)} className={`!flex text-[15px] ${toggle}`}>
          Additional settings
          <Chevron open={extra} />
        </button>
        <Collapsible open={extra} id={extraId}>
          <div className="mt-1.5 flex">
            <CheckboxField fit label="Keep only 1 QB" checked={s.oneQb} onChange={(oneQb) => onChange({ oneQb })} />
          </div>
        </Collapsible>
      </div>
      </Collapsible>
    </section>
  )
}
