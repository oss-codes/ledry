type SnapshotRoot = {
  readonly textContent: string | null
  querySelector(selectors: string): SnapshotRoot | null
}

type SnapshotDocument = {
  readonly body: SnapshotRoot
  querySelector(selectors: string): SnapshotRoot | null
}

function textSnapshot(parts: readonly (SnapshotRoot | null)[]): SnapshotRoot {
  return {
    textContent: parts
      .flatMap((part) => (part?.textContent == null ? [] : [part.textContent]))
      .join(" "),
    querySelector: () => null,
  }
}

export function publicSnapshotRoot(
  page: SnapshotDocument,
  sourceType: SourceType,
): SnapshotRoot | null {
  if (sourceType === "google-maps") {
    const feed = page.querySelector('[role="feed"]')
    if (feed !== null) return feed
    const detail =
      page.querySelector("main") ?? page.querySelector('[role="main"]')
    if (detail === null) return null
    const publicFields = [
      detail.querySelector("h1"),
      detail.querySelector('[jsaction*="pane.rating.category"]'),
      detail.querySelector('[data-item-id="address"]'),
      detail.querySelector('[data-item-id^="phone:tel:"]'),
      detail.querySelector('[data-item-id="authority"]'),
    ]
    return publicFields[0] === null ||
      publicFields.slice(1).every((field) => field === null)
      ? null
      : textSnapshot(publicFields)
  }
  if (sourceType === "google-search") return page.querySelector("#search")
  if (sourceType === "social") return page.querySelector('main, [role="main"]')
  if (sourceType === "website")
    return page.querySelector('main, [role="main"]') ?? page.body
  return sourceType satisfies never
}

import type { SourceType } from "../src/schemas"
