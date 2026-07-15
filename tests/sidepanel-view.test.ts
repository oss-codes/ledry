import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import type { SidepanelStatus } from "../extension/sidepanel-messages"
import { createSidepanelView } from "../extension/sidepanel-view"

let markup = ""

function status(
  state: "approved" | "approval-required" | null,
  overrides: Partial<SidepanelStatus> = {},
): SidepanelStatus {
  return {
    bridgeConnected: true,
    configReady: true,
    currentBrief: "",
    lastRun: null,
    tab:
      state === null
        ? null
        : {
            id: 42,
            title: "Google Maps results",
            url: "https://www.google.com/maps",
            origin: "https://www.google.com",
            state,
          },
    ...overrides,
  }
}

beforeAll(async () => {
  GlobalRegistrator.register()
  markup = await Bun.file(
    new URL("../extension/sidepanel.html", import.meta.url),
  ).text()
  markup = markup.replace(
    '<script type="module" src="dist/sidepanel.js"></script>',
    "",
  )
})

beforeEach(() => {
  document.open()
  document.write(markup)
  document.close()
})

afterAll(() => {
  GlobalRegistrator.unregister()
})

describe("side panel DOM view", () => {
  test("renders an honest empty and configuring state", () => {
    const view = createSidepanelView()

    view.render(status(null, { bridgeConnected: false, configReady: false }))

    expect(document.querySelector("#tab-badge")?.textContent).toBe("No tab")
    expect(document.querySelector("#connection-status")?.textContent).toBe(
      "Offline",
    )
    expect(view.configure.hidden).toBeFalse()
    expect(
      document.querySelector("#save-brief")?.hasAttribute("disabled"),
    ).toBeTrue()
  })

  test("shows textual readiness and a saved brief thread", () => {
    const view = createSidepanelView()

    view.hydrate(
      status("approved", {
        currentBrief: "Find public design agencies in Bengaluru",
      }),
    )

    expect(document.querySelector("#activity-bridge-label")?.textContent).toBe(
      "Online",
    )
    expect(
      document.querySelector("#activity-approval-label")?.textContent,
    ).toBe("Approved")
    expect(
      document.querySelector("#activity-research-label")?.textContent,
    ).toBe("Ready")
    expect(document.querySelector("#brief-summary")?.textContent).toBe(
      "Find public design agencies in Bengaluru",
    )
    expect(
      document.querySelector("#brief-thread")?.hasAttribute("hidden"),
    ).toBeFalse()
    expect(view.capture.disabled).toBeFalse()
  })

  test("renders the latest durable run report", () => {
    const view = createSidepanelView()
    view.render(
      status("approved", {
        currentBrief: "Find five coffee roasters",
        lastRun: {
          id: "run:test",
          brief: "Find five coffee roasters",
          tabId: 42,
          requestedSource: "auto",
          actualSources: ["google-maps"],
          limit: 5,
          discovered: 7,
          saved: 5,
          quarantined: 1,
          skipped: 1,
          status: "completed",
          warnings: ["1 unsafe candidate(s) quarantined"],
          startedAt: "2026-07-15T00:00:00.000Z",
          completedAt: "2026-07-15T00:00:01.000Z",
          recordIds: [],
        },
      }),
    )

    expect(
      document.querySelector("#run-result")?.hasAttribute("hidden"),
    ).toBeFalse()
    expect(document.querySelector("#run-saved")?.textContent).toBe("5")
    expect(document.querySelector("#run-quarantined")?.textContent).toBe("1")
  })

  test("announces approval progress and preserves focus on completion", () => {
    const view = createSidepanelView()
    view.render(status("approval-required"))
    view.approval.focus()

    view.setBusy("approval")
    expect(view.approval.textContent).toBe("Approving…")
    expect(view.approval.getAttribute("aria-busy")).toBe("true")

    view.render(status("approved"))
    view.focusWorkspaceTitle()
    expect(document.activeElement?.id).toBe("workspace-title")
  })

  test("announces and locks the initiating utility action", () => {
    const view = createSidepanelView()
    view.render(status("approved"))

    view.setBusy("dashboard")
    expect(view.dashboard.getAttribute("aria-label")).toBe(
      "Opening Ledry dashboard",
    )
    expect(view.dashboard.getAttribute("aria-busy")).toBe("true")
    expect(view.settings.disabled).toBeTrue()

    view.setBusy("settings")
    expect(view.settings.getAttribute("aria-label")).toBe(
      "Opening extension settings",
    )
    expect(view.settings.getAttribute("aria-busy")).toBe("true")
  })
})
