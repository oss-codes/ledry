import { type ResearchRun, ResearchRunSchema } from "../src/schemas"
import { approveTab, isApprovedTab, selectedResearchTab } from "./approved-tabs"
import { isAllowedUrl } from "./policy"
import {
  type SidepanelRequest,
  SidepanelRequestSchema,
  type SidepanelStatus,
} from "./sidepanel-messages"

export type ExtensionConfig = {
  readonly port: number
  readonly token: string
}

export async function readExtensionConfig(): Promise<ExtensionConfig> {
  const values = await chrome.storage.local.get(["port", "token"])
  return {
    port: typeof values["port"] === "number" ? values["port"] : 43110,
    token: typeof values["token"] === "string" ? values["token"] : "",
  }
}

async function readStatus(bridgeConnected: boolean): Promise<SidepanelStatus> {
  const [config, values, tabs, selectedTab] = await Promise.all([
    readExtensionConfig(),
    chrome.storage.local.get(["currentBrief", "lastRun"]),
    chrome.tabs.query({ active: true, currentWindow: true }),
    selectedResearchTab(),
  ])
  const activeTab = selectedTab ?? tabs[0]
  const rawBrief = values["currentBrief"]
  const currentBrief =
    typeof rawBrief === "string" ? rawBrief.slice(0, 2_000) : ""
  const parsedLastRun = ResearchRunSchema.safeParse(values["lastRun"])
  const lastRun = parsedLastRun.success ? parsedLastRun.data : null

  if (activeTab?.id === undefined || activeTab.url === undefined)
    return {
      bridgeConnected,
      configReady: config.token.length >= 16,
      currentBrief,
      lastRun,
      tab: null,
    }

  const allowed = isAllowedUrl(activeTab.url)
  const origin = allowed ? new URL(activeTab.url).origin : null
  const approvedForOrigin = origin !== null && (await isApprovedTab(activeTab))

  return {
    bridgeConnected,
    configReady: config.token.length >= 16,
    currentBrief,
    lastRun,
    tab: {
      id: activeTab.id,
      title: activeTab.title ?? "Untitled tab",
      url: activeTab.url,
      origin,
      state: !allowed
        ? "blocked"
        : approvedForOrigin
          ? "approved"
          : "approval-required",
    },
  }
}

async function handleRequest(
  request: SidepanelRequest,
  bridgeConnected: boolean,
  capture: (
    tabId: number,
    limit: number,
    brief: string,
  ) => Promise<ResearchRun>,
): Promise<SidepanelStatus> {
  switch (request.type) {
    case "sidepanel.status":
      return await readStatus(bridgeConnected)
    case "sidepanel.tab.approve": {
      const tab = await chrome.tabs.get(request.tabId)
      if (
        tab.url === undefined ||
        !isAllowedUrl(tab.url) ||
        new URL(tab.url).origin !== request.origin
      )
        throw new Error("The selected tab changed before approval")
      await approveTab(tab)
      return await readStatus(bridgeConnected)
    }
    case "sidepanel.dashboard.open": {
      const config = await readExtensionConfig()
      await chrome.tabs.create({ url: `http://127.0.0.1:${config.port}` })
      return await readStatus(bridgeConnected)
    }
    case "sidepanel.options.open":
      await chrome.runtime.openOptionsPage()
      return await readStatus(bridgeConnected)
    case "sidepanel.brief.save":
      await chrome.storage.local.set({ currentBrief: request.brief })
      return await readStatus(bridgeConnected)
    case "sidepanel.capture": {
      const status = await readStatus(bridgeConnected)
      if (status.tab?.state !== "approved" || status.tab.id !== request.tabId)
        throw new Error("Approve the active tab before capturing leads")
      const run = await capture(
        request.tabId,
        request.limit,
        status.currentBrief,
      )
      await chrome.storage.local.set({ lastRun: run })
      return await readStatus(bridgeConnected)
    }
    default:
      return request satisfies never
  }
}

export function registerSidepanelMessages(
  bridgeConnected: () => boolean,
  capture: (
    tabId: number,
    limit: number,
    brief: string,
  ) => Promise<ResearchRun>,
): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (
      sender.id !== chrome.runtime.id ||
      sender.url !== chrome.runtime.getURL("sidepanel.html")
    )
      return false
    const request = SidepanelRequestSchema.safeParse(message)
    if (!request.success) {
      sendResponse({ ok: false, error: "Invalid side panel request" })
      return false
    }
    void handleRequest(request.data, bridgeConnected(), capture).then(
      (status) => sendResponse({ ok: true, status }),
      (error: unknown) =>
        sendResponse({
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Side panel request failed",
        }),
    )
    return true
  })
}
