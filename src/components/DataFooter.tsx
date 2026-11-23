import { describeSfSource } from '../lib/sfSource'
import type { PlayersFile } from '../types'
import { Attribution } from './Attribution'

interface Props {
  file: PlayersFile | null
  /** Season to assume for the superflex note when the data file isn't loaded. */
  fallbackSeason: number
}

/** Where the numbers come from and how fresh they are. The last thing on every tab. */
export function DataFooter({ file, fallbackSeason }: Props) {
  const generated = file ? new Date(file.generatedAt) : null
  const refreshed =
    generated && !Number.isNaN(generated.getTime())
      ? generated.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
      : ''
  return (
    <footer className="pt-5 pb-6">
      <p className="m-0 text-[13px] leading-relaxed text-mut">
        {file ? `ADP is from the ${file.season} season (${file.source}). ` : ''}
        {file?.statsThrough
          ? `Current-season production is through week ${file.statsThrough}. `
          : 'No current-season production data yet, so values use preseason ADP. '}
        {refreshed ? `Data refreshed ${refreshed}. ` : ''}
        {describeSfSource(file?.sfSource, file?.season ?? fallbackSeason)}
      </p>
      <Attribution />
    </footer>
  )
}
