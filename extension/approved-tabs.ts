import { sanitizePublicUrl } from "../src/url-policy"
import { isAllowedUrl } from "./policy"

type ApprovedTab = { readonly id: number; readonly origin: string }

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
    return typeof item.id === "number" && typeof item.origin === "string"
      ? [{ id: item.id, origin: item.origin }]
      : []
  })
}

async function rememberApprovedTab(tabId: number, origin: string) {
  const current = await approvedTabs()
  await chrome.storage.session.set({
    approvedTabs: [
      ...current.filter((item) => item.id !== tabId),
      { id: tabId, origin },
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
  if (tab.url === undefined || !isAllowedUrl(tab.url)) {
    await forgetApprovedTab(tabId)
    throw new Error("This source is outside the project's scope")
  }
  const origin = new URL(tab.url).origin
  if (
    !(await approvedTabs()).some(
      (item) => item.id === tabId && item.origin === origin,
    )
  )
    throw new Error("Approve this origin from the Ledry side panel first")
  try {
    await requirePublicBusinessPage(tabId)
  } catch (error) {
    await forgetApprovedTab(tabId)
    throw error
  }
}

export async function listApprovedTabs(): Promise<
  readonly {
    readonly id: number
    readonly title: string
    readonly url: string
  }[]
> {
  const [tabs, approved] = await Promise.all([
    chrome.tabs.query({}),
    approvedTabs(),
  ])
  const results: { id: number; title: string; url: string }[] = []
  for (const tab of tabs) {
    if (tab.id === undefined || tab.url === undefined) continue
    const origin = new URL(tab.url).origin
    if (!approved.some((item) => item.id === tab.id && item.origin === origin))
      continue
    try {
      await assertApprovedTab(tab.id)
      const current = await chrome.tabs.get(tab.id)
      if (
        current.url === undefined ||
        !isAllowedUrl(current.url) ||
        new URL(current.url).origin !== origin
      )
        continue
      results.push({
        id: tab.id,
        title: current.title ?? "Untitled",
        url: sanitizePublicUrl(current.url),
      })
    } catch {}
  }
  return results
}

export async function approveTab(
  tab: Pick<chrome.tabs.Tab, "id" | "url">,
): Promise<void> {
  if (tab.id === undefined || tab.url === undefined || !isAllowedUrl(tab.url)) {
    if (tab.id !== undefined) await forgetApprovedTab(tab.id)
    await chrome.action.setBadgeText({ text: "NO", tabId: tab.id })
    return
  }
  try {
    await requirePublicBusinessPage(tab.id)
  } catch (error) {
    await chrome.action.setBadgeText({ text: "NO", tabId: tab.id })
    throw error
  }
  await rememberApprovedTab(tab.id, new URL(tab.url).origin)
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
