import stringWidth from "string-width"

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" })

export function sanitizeTerminalText(value: string): string {
  return Array.from(value, (character) => {
    const code = character.charCodeAt(0)
    const isControl =
      code <= 0x1f ||
      (code >= 0x7f && code <= 0x9f) ||
      code === 0x61c ||
      code === 0x200e ||
      code === 0x200f ||
      (code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069)
    return isControl ? "�" : character
  }).join("")
}

export function truncateCells(value: string, maxWidth: number): string {
  if (maxWidth <= 0) return ""
  const safeValue = sanitizeTerminalText(value)
  if (stringWidth(safeValue) <= maxWidth) return safeValue
  if (maxWidth === 1) return "…"

  let result = ""
  let width = 0
  const contentWidth = maxWidth - 1
  for (const { segment } of graphemes.segment(safeValue)) {
    const segmentWidth = stringWidth(segment)
    if (width + segmentWidth > contentWidth) break
    result += segment
    width += segmentWidth
  }
  return `${result}…`
}
