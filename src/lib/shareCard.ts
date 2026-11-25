import { INJURY_TAG } from './availability'
import type { EvalItem, Grade, TeamTrade, Verdict } from './valuation'

export interface CardSide {
  name: string
  grade: Grade | null
  trade: TeamTrade
  items: EvalItem[]
}

export interface CardData {
  subtitle: string
  sides: [CardSide, CardSide]
  verdict: Verdict
}

const W = 1200
const H = 675
const FONT = '"Inter Variable", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

/** One line of text for an asset on the card. */
export function assetLine(it: EvalItem): string {
  const a = it.asset
  if (a.t === 'k') return `${a.year} Round ${a.round} pick`
  if (!it.player) return 'Unknown player'
  const hurt = it.player.inj ? `  ·  ${INJURY_TAG[it.player.inj]}` : ''
  return `${it.player.name}  ·  ${it.player.pos} ${it.player.team}  ·  Rd ${a.keeperRound}${hurt}`
}

function gradeColor(g: Grade | null): string {
  if (!g) return '#9aa4b6'
  return g[0] === 'A' ? '#4ade80' : g[0] === 'B' ? '#7aa7ff' : g[0] === 'C' ? '#f79009' : '#f87171'
}

function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1)
  return `${t}…`
}

/** Draws the shareable trade card (always dark, so it reads the same wherever it's posted). */
export function drawTradeCard(canvas: HTMLCanvasElement, d: CardData) {
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#0b0f17'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#151b26'
  ctx.fillRect(0, 0, W, 96)

  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#eef1f7'
  ctx.font = `700 34px ${FONT}`
  ctx.fillText('Keeper League Trade Calculator', 40, 52)
  ctx.fillStyle = '#9aa4b6'
  ctx.font = `400 22px ${FONT}`
  ctx.fillText(fit(ctx, d.subtitle, W - 80), 40, 82)

  const colW = (W - 120) / 2
  d.sides.forEach((side, i) => {
    const x = 40 + i * (colW + 40)
    ctx.fillStyle = '#151b26'
    ctx.beginPath()
    ctx.roundRect(x, 120, colW, 400, 16)
    ctx.fill()

    ctx.fillStyle = '#eef1f7'
    ctx.font = `700 30px ${FONT}`
    ctx.fillText(fit(ctx, side.name, colW - 130), x + 24, 168)
    // Grade badge
    ctx.fillStyle = '#212938'
    ctx.beginPath()
    ctx.roundRect(x + colW - 104, 130, 84, 52, 12)
    ctx.fill()
    ctx.fillStyle = gradeColor(side.grade)
    ctx.font = `800 36px ${FONT}`
    ctx.textAlign = 'center'
    ctx.fillText(side.grade ?? '–', x + colW - 62, 168)
    ctx.textAlign = 'left'

    ctx.fillStyle = '#9aa4b6'
    ctx.font = `400 22px ${FONT}`
    ctx.fillText('SENDS', x + 24, 214)

    ctx.fillStyle = '#eef1f7'
    ctx.font = `500 24px ${FONT}`
    const shown = side.items.slice(0, 6)
    shown.forEach((it, k) => ctx.fillText(fit(ctx, assetLine(it), colW - 48), x + 24, 252 + k * 38))
    if (side.items.length > shown.length) {
      ctx.fillStyle = '#9aa4b6'
      ctx.fillText(`+ ${side.items.length - shown.length} more`, x + 24, 252 + shown.length * 38)
    }
    if (side.items.length === 0) {
      ctx.fillStyle = '#9aa4b6'
      ctx.fillText('Nothing', x + 24, 252)
    }

    ctx.fillStyle = '#9aa4b6'
    ctx.font = `400 22px ${FONT}`
    ctx.fillText(`gets ${side.trade.gets.toFixed(1)}  ·  gives ${side.trade.gives.toFixed(1)}`, x + 24, 496)
  })

  // Balance bar
  const barX = 40
  const barW = W - 80
  const left = (d.verdict.share1 / 100) * barW
  ctx.fillStyle = '#7aa7ff'
  ctx.fillRect(barX, 548, left, 14)
  ctx.fillStyle = '#f79009'
  ctx.fillRect(barX + left, 548, barW - left, 14)

  ctx.fillStyle = '#eef1f7'
  ctx.font = `700 34px ${FONT}`
  ctx.textAlign = 'center'
  ctx.fillText(fit(ctx, d.verdict.message, W - 80), W / 2, 612)
  ctx.fillStyle = '#9aa4b6'
  ctx.font = `400 20px ${FONT}`
  ctx.fillText('keeperleaguetradecalculator.com', W / 2, 650)
  ctx.textAlign = 'left'
}

/** Renders the card and resolves to a PNG blob. */
export function cardBlob(d: CardData): Promise<Blob | null> {
  const canvas = document.createElement('canvas')
  drawTradeCard(canvas, d)
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}
