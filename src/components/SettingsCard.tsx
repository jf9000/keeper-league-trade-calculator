import { LIMITS } from '../lib/valuation'
import type { Scoring, Settings } from '../types'
import { CheckboxField } from './CheckboxField'
import { NumberField } from './NumberField'
import { RedraftWeightInfo } from './RedraftWeightInfo'

interface Props {
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
}

export function SettingsCard({ settings: s, onChange }: Props) {
  return (
    <details className="rounded-xl border border-bd bg-card p-3" open>
      <summary className="cursor-pointer font-semibold">League settings</summary>
      <div className="mt-2.5 grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2.5">
        <NumberField label="League size" value={s.teams} {...LIMITS.teams} onChange={(teams) => onChange({ teams })} />
        <NumberField label="Keepers" value={s.keepers} {...LIMITS.keepers} onChange={(keepers) => onChange({ keepers })} />
        <NumberField label="Draft rounds" value={s.rounds} {...LIMITS.rounds} onChange={(rounds) => onChange({ rounds })} />
        <NumberField label="Flex spots" value={s.flex} {...LIMITS.flex} onChange={(flex) => onChange({ flex })} />
        <label className="flex flex-col gap-[3px] text-xs text-mut">
          Scoring
          <select value={s.scoring} onChange={(e) => onChange({ scoring: e.target.value as Scoring })}>
            <option value="ppr">PPR</option>
            <option value="half">Half PPR</option>
            <option value="std">No PPR</option>
          </select>
        </label>
        <CheckboxField label="Superflex" checked={s.superflex} onChange={(superflex) => onChange({ superflex })} />
      </div>

      <details className="mt-3 rounded-lg border border-bd p-2.5">
        <summary className="cursor-pointer text-sm font-semibold">Additional settings</summary>
        <div className="mt-2.5 grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2.5">
          <NumberField
            label="Redraft weight (%)"
            value={s.redraftWeight}
            {...LIMITS.redraftWeight}
            onChange={(redraftWeight) => onChange({ redraftWeight })}
            hint={<RedraftWeightInfo />}
          />
          <CheckboxField label="Keep only 1 QB" checked={s.oneQb} onChange={(oneQb) => onChange({ oneQb })} />
        </div>
      </details>
    </details>
  )
}
