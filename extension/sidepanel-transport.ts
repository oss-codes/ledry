import {
  type SidepanelRequest,
  SidepanelResponseSchema,
  type SidepanelStatus,
  SidepanelTabStateSchema,
} from "./sidepanel-messages"
import { requestOriginPermission } from "./sidepanel-permissions"
export interface SidepanelTransport {
  approveTab(tabId: number, url: string): Promise<SidepanelStatus>
  request(request: SidepanelRequest): Promise<SidepanelStatus>
}

class SidepanelTransportError extends Error {
  override readonly name = "SidepanelTransportError"
}

class RuntimeTransport implements SidepanelTransport {
  async approveTab(tabId: number, url: string): Promise<SidepanelStatus> {
    await requestOriginPermission(url)
    return await this.request({
      type: "sidepanel.tab.approve",
      tabId,
      origin: new URL(url).origin,
    })
  }

  async request(request: SidepanelRequest): Promise<SidepanelStatus> {
    const response = SidepanelResponseSchema.parse(
      await chrome.runtime.sendMessage(request),
    )
    if (!response.ok) throw new SidepanelTransportError(response.error)
    return response.status
  }
}

class PreviewTransport implements SidepanelTransport {
  #status: SidepanelStatus

  constructor(state: string | null) {
    const tabState = SidepanelTabStateSchema.catch("approved").parse(state)
    this.#status = {
      bridgeConnected: state !== "offline" && state !== "configuring",
      configReady: state !== "configuring",
      currentBrief: "",
      lastRun: null,
      tab:
        state === "empty" || state === "configuring"
          ? null
          : {
              id: 42,
              title: "Google Maps — creative agencies in Bengaluru",
              url: "https://www.google.com/maps/search/creative+agencies",
              origin: "https://www.google.com",
              state: tabState,
            },
    }
  }

  async approveTab(tabId: number, _url: string): Promise<SidepanelStatus> {
    return await this.request({
      type: "sidepanel.tab.approve",
      tabId,
      origin: this.#status.tab?.origin ?? "",
    })
  }

  async request(request: SidepanelRequest): Promise<SidepanelStatus> {
    switch (request.type) {
      case "sidepanel.tab.approve":
        if (this.#status.tab !== null)
          this.#status = {
            ...this.#status,
            tab: { ...this.#status.tab, state: "approved" },
          }
        return this.#status
      case "sidepanel.brief.save":
        this.#status = {
          ...this.#status,
          currentBrief: request.brief,
        }
        return this.#status
      case "sidepanel.capture":
        this.#status = {
          ...this.#status,
          lastRun: {
            id: "run:preview",
            brief: this.#status.currentBrief,
            tabId: request.tabId,
            requestedSource: "auto",
            actualSources: ["google-maps"],
            limit: request.limit,
            discovered: 7,
            saved: Math.min(5, request.limit),
            quarantined: 1,
            skipped: Math.max(0, 6 - request.limit),
            status: "completed",
            warnings: ["1 unsafe candidate(s) quarantined"],
            startedAt: "2026-07-15T00:00:00.000Z",
            completedAt: "2026-07-15T00:00:01.000Z",
            recordIds: [],
          },
        }
        return this.#status
      case "sidepanel.status":
      case "sidepanel.dashboard.open":
      case "sidepanel.options.open":
        return this.#status
      default:
        return request satisfies never
    }
  }
}

export function createSidepanelTransport(
  previewState: string | null,
): SidepanelTransport {
  return previewState === null
    ? new RuntimeTransport()
    : new PreviewTransport(previewState)
}
