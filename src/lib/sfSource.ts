/**
 * Plain-English note about where superflex QB ADP came from, or null when nothing needs saying.
 * `sfSource` is the label build-players writes into players.json, e.g. "ffc-2qb:2026 (+21 QBs estimated)".
 */
export function describeSfSource(sfSource: string | undefined, season: number): string | null {
  if (!sfSource) return null
  const real = /^ffc-2qb:(\d{4})(?: \(\+(\d+) QBs? estimated\))?$/.exec(sfSource)
  if (real) {
    const [, year, count] = real
    return count
      ? `Superflex QB ADP comes from Fantasy Football Calculator’s ${year} superflex drafts. ${count} QBs missing from them are estimated.`
      : null
  }
  const estimated = /^estimated:(\d{4})$/.exec(sfSource)
  if (estimated) {
    return `Superflex QB ADP is estimated from ${estimated[1]}’s superflex drafts, since there are no ${season} ones yet.`
  }
  return null
}
