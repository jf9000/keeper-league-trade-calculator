/** "1st", "2nd", "3rd", "11th", "21st"... */
export function ordinal(n: number): string {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`
}

/** An ADP as a whole draft slot: the overall pick, and the round and pick within the round for a league of `teams`. */
export function adpSlot(adp: number, teams: number): { round: number; pick: number; overall: number } {
  const overall = Math.max(1, Math.round(adp))
  const round = Math.ceil(overall / teams)
  return { round, pick: overall - (round - 1) * teams, overall }
}

/** An ADP as a whole overall pick, e.g. "2nd overall". */
export const adpLabel = (adp: number): string => `${ordinal(adpSlot(adp, 1).overall)} overall`
