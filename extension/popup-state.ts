import {
  canonicalHostname,
  isGoogleMapsUrl,
  isGoogleSearchUrl,
  isPublicLinkedInOrganizationUrl,
  isSocialHost,
} from "../src/url-policy"
import type { ApprovedTab } from "./approved-tabs"
import { isAllowedUrl } from "./policy"

export type PickerTab = {
  readonly id: number
  readonly title: string
  readonly url: string
  readonly origin: string
  readonly source: string
  readonly approved: boolean
  readonly active: boolean
}

export type PickerState = {
  readonly tabs: readonly PickerTab[]
  readonly selectedId: number | null
}

export function canOpenPickerTab(
  tab: PickerTab | undefined,
  persistedTabId: number | null,
): boolean {
  return tab?.active === true && tab.approved && tab.id === persistedTabId
}

function sourceName(url: URL): string {
  if (isGoogleMapsUrl(url.href)) return "Google Maps"
  if (isGoogleSearchUrl(url.href)) return "Google Search"
  if (isPublicLinkedInOrganizationUrl(url.href)) return "LinkedIn company"
  const host = canonicalHostname(url)
  if (host === "instagram.com" || host.endsWith(".instagram.com"))
    return "Instagram page"
  if (isSocialHost(host)) return "Social page"
  return "Public website"
}

export function createPickerState(
  browserTabs: readonly Pick<
    chrome.tabs.Tab,
    "active" | "id" | "title" | "url"
  >[],
  approvedTabs: readonly ApprovedTab[],
  preferredTabId: number | null,
): PickerState {
  const tabs = browserTabs.flatMap((tab): readonly PickerTab[] => {
    if (tab.id === undefined || tab.url === undefined || !isAllowedUrl(tab.url))
      return []
    const url = new URL(tab.url)
    return [
      {
        id: tab.id,
        title: tab.title?.trim() || "Untitled tab",
        url: tab.url,
        origin: url.origin,
        source: sourceName(url),
        approved: approvedTabs.some(
          (approved) =>
            approved.id === tab.id && approved.origin === url.origin,
        ),
        active: tab.active,
      },
    ]
  })
  const selectedId = tabs.some((tab) => tab.id === preferredTabId)
    ? preferredTabId
    : (tabs.find((tab) => tab.active)?.id ?? tabs[0]?.id ?? null)
  return { tabs, selectedId }
}
