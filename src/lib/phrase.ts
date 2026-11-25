/** Picked once per visit, so wording varies between visits but doesn't change while a trade is edited. */
const SALT = String(Math.random())

/**
 * One of several ways to say the same thing in a trade note. One side of a trade only draws from the even-numbered
 * options and the other from the odd-numbered ones, so the two sides never read the same. Give at least two options,
 * and at least four for each side to have a choice. `nth` steps to another option when one side repeats a kind of note.
 */
export function phrase<T>(options: readonly T[], seed: string, side: 0 | 1 = 0, nth = 0): T {
  const mine = options.filter((_, i) => i % 2 === side)
  const text = SALT + seed
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0
  return mine[(h + nth) % mine.length]!
}
