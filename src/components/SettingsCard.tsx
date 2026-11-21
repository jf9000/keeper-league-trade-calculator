import { LIMITS } from '../lib/valuation'
import type { Scoring, Settings } from '../types'
import { NumberField } from './NumberField'

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
        <div className="flex flex-col divide-y divide-bd self-start rounded-lg border border-bd">
          <label className="flex items-center gap-2 px-2.5 py-2 text-sm text-tx">
            <input type="checkbox" checked={s.superflex} onChange={(e) => onChange({ superflex: e.target.checked })} />
            Superflex
          </label>
          <label className="flex items-center gap-2 px-2.5 py-2 text-sm text-tx">
            <input type="checkbox" checked={s.oneQb} onChange={(e) => onChange({ oneQb: e.target.checked })} />
            Keep only 1 QB
          </label>
        </div>
      </div>
    </details>
  )
}
