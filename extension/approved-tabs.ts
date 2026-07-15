import { sanitizePublicUrl } from "../src/url-policy"
import { isAllowedUrl } from "./policy"

export type ApprovedTab = {
  readonly id: number
  readonly origin: string
  readonly url?: string
}

export async function selectedResearchTabId(): Promise<number | null> {
  const stored = await chrome.storage.session.get("selectedResearchTabId")
  const selected: unknown = stored["selectedResearchTabId"]
  return typeof selected === "number" && Number.isInteger(selected)
    ? selected
    : null
}

export async function selectResearchTab(tabId: number): Promise<void> {
  await chrome.storage.session.set({ selectedResearchTabId: tabId })
}

export async function selectedResearchTab(): Promise<chrome.tabs.Tab | null> {
  const tabId = await selectedResearchTabId()
  if (tabId === null) return null
  try {
    return await chrome.tabs.get(tabId)
  } catch (error) {
    if (
      error instanceof Error &&
      /No tab with id|Invalid tab ID|tab not found/i.test(error.message)
    ) {
      await chrome.storage.session.remove("selectedResearchTabId")
      return null
    }
    throw error
  }
}

export async function approvedTabs(): Promise<readonly ApprovedTab[]> {
  const stored = await chrome.storage.session.get("approvedTabs")
  const raw: unknown = stored["approvedTabs"]
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item: unknown) => {
    if (
      typeof item !== "object" ||
      item === null ||
      !("id" in item) ||
      !("origin" in item)
    )
      return []
    const url =
      "url" in item && typeof item.url === "string" ? item.url : undefined
    return typeof item.id === "number" && typeof item.origin === "string"
      ? [
          {
            id: item.id,
            origin: item.origin,
            ...(url === undefined ? {} : { url }),
          },
        ]
      : []
  })
}

async function rememberApprovedTab(tabId: number, rawUrl: string) {
  const current = await approvedTabs()
  const url = sanitizePublicUrl(rawUrl)
  await chrome.storage.session.set({
    approvedTabs: [
      ...current.filter((item) => item.id !== tabId),
      { id: tabId, origin: new URL(url).origin, url },
    ],
  })
}

async function forgetApprovedTab(tabId: number): Promise<void> {
  const current = await approvedTabs()
  await chrome.storage.session.set({
    approvedTabs: current.filter((item) => item.id !== tabId),
  })
  await chrome.action.setBadgeText({ text: "", tabId })
}

async function requirePublicBusinessPage(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["dist/content-script.js"],
  })
  const classification: unknown = await chrome.tabs.sendMessage(tabId, {
    action: "classify",
  })
  if (
    typeof classification !== "object" ||
    classification === null ||
    !("publicBusiness" in classification) ||
    classification.publicBusiness !== true
  )
    throw new Error(
      "This page does not expose explicit public business-page evidence",
    )
}

export async function assertApprovedTab(tabId: number): Promise<void> {
  const tab = await chrome.tabs.get(tabId)
  await validateApprovedTab(tab)
}

async function validateApprovedTab(tab: chrome.tabs.Tab): Promise<void> {
  if (tab.id === undefined) throw new Error("The browser tab is no longer open")
  if (tab.url === undefined || !isAllowedUrl(tab.url)) {
    await forgetApprovedTab(tab.id)
    throw new Error("This source is outside the project's scope")
  }
  const origin = new URL(tab.url).origin
  const approved = (await approvedTabs()).find(
    (item) => item.id === tab.id && item.origin === origin,
  )
  if (approved === undefined)
    throw new Error("Approve this origin from the Ledry side panel first")
  try {
    await requirePublicBusinessPage(tab.id)
    if (approved.url !== sanitizePublicUrl(tab.url))
      await rememberApprovedTab(tab.id, tab.url)
  } catch (error) {
    await forgetApprovedTab(tab.id)
    throw error
  }
}

export async function isApprovedTab(tab: chrome.tabs.Tab): Promise<boolean> {
  try {
    await validateApprovedTab(tab)
    return true
  } catch {
    return false
  }
}

export async function listApprovedTabs(): Promise<
  readonly {
    readonly id: number
    readonly selected: boolean
    readonly title: string
    readonly url: string
  }[]
> {
  const [tabs, selectedId] = await Promise.all([
    chrome.tabs.query({}),
    selectedResearchTabId(),
  ])
  const results: {
    id: number
    selected: boolean
    title: string
    url: string
  }[] = []
  for (const tab of tabs) {
    if (tab.id === undefined || tab.url === undefined) continue
    try {
      await assertApprovedTab(tab.id)
      const current = await chrome.tabs.get(tab.id)
      if (
        current.url === undefined ||
        !isAllowedUrl(current.url) ||
        new URL(current.url).origin !== new URL(tab.url).origin
      )
        continue
      results.push({
        id: tab.id,
        selected: tab.id === selectedId,
        title: current.title ?? "Untitled",
        url: sanitizePublicUrl(current.url),
      })
    } catch {}
  }
  return results.sort(
    (left, right) => Number(right.selected) - Number(left.selected),
  )
}

export async function approveTab(
  tab: Pick<chrome.tabs.Tab, "id" | "url">,
): Promise<void> {
  if (tab.id === undefined || tab.url === undefined || !isAllowedUrl(tab.url)) {
    if (tab.id !== undefined) await forgetApprovedTab(tab.id)
    await chrome.action.setBadgeText({ text: "NO", tabId: tab.id })
    throw new Error("This tab cannot be approved as a public research source")
  }
  const current = await chrome.tabs.get(tab.id)
  if (
    current.url === undefined ||
    !isAllowedUrl(current.url) ||
    new URL(current.url).origin !== new URL(tab.url).origin
  )
    throw new Error("The selected tab changed before approval")
  try {
    await requirePublicBusinessPage(tab.id)
  } catch (error) {
    await chrome.action.setBadgeText({ text: "NO", tabId: tab.id })
    throw error
  }
  await rememberApprovedTab(tab.id, current.url)
  await chrome.action.setBadgeText({ text: "OK", tabId: tab.id })
  await chrome.action.setBadgeBackgroundColor({
    color: "#16a34a",
    tabId: tab.id,
  })
}

export async function navigateApprovedTab(
  tabId: number,
  url: string,
): Promise<{
  readonly id: number
  readonly title: string
  readonly url: string
}> {
  await assertApprovedTab(tabId)
  if (!isAllowedUrl(url))
    throw new Error("This destination is outside the project's scope")
  const current = await chrome.tabs.get(tabId)
  if (current.url === undefined)
    throw new Error("The browser did not report the approved tab URL")
  const approvedOrigin = new URL(current.url).origin
  if (approvedOrigin !== new URL(url).origin)
    throw new Error(
      "Cross-origin navigation requires the user to approve the destination tab",
    )
  await chrome.tabs.update(tabId, { active: true, url })
  const tab = await waitForTab(tabId)
  if (tab.url === undefined)
    throw new Error("The browser did not report the navigated URL")
  if (!isAllowedUrl(tab.url) || new URL(tab.url).origin !== approvedOrigin) {
    await forgetApprovedTab(tabId)
    throw new Error(
      "Navigation left the approved origin; approve the destination tab before continuing",
    )
  }
  try {
    await requirePublicBusinessPage(tabId)
    await rememberApprovedTab(tabId, tab.url)
  } catch (error) {
    await forgetApprovedTab(tabId)
    throw error
  }
  return { id: tabId, title: tab.title ?? "Untitled", url: tab.url }
}

async function waitForTab(tabId: number): Promise<chrome.tabs.Tab> {
  const current = await chrome.tabs.get(tabId)
  if (current.status === "complete") return current
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated)
      reject(new Error("Timed out waiting for browser navigation"))
    }, 15_000)
    function onUpdated(
      updatedTabId: number,
      change: chrome.tabs.OnUpdatedInfo,
      tab: chrome.tabs.Tab,
    ) {
      if (updatedTabId !== tabId || change.status !== "complete") return
      clearTimeout(timer)
      chrome.tabs.onUpdated.removeListener(onUpdated)
      resolve(tab)
    }
    chrome.tabs.onUpdated.addListener(onUpdated)
  })
}
