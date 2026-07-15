import { describe, expect, test } from "bun:test"
import type {
  SidepanelStatus,
  SidepanelTabState,
} from "../extension/sidepanel-messages"
import { presentStatus } from "../extension/sidepanel-state"
import type { ResearchRun } from "../src/schemas"

function status(
  tabState: SidepanelTabState | null,
  overrides: Partial<
    Pick<SidepanelStatus, "bridgeConnected" | "configReady" | "lastRun">
  > = {},
): SidepanelStatus {
  return {
    bridgeConnected: overrides.bridgeConnected ?? true,
    configReady: overrides.configReady ?? true,
    currentBrief: "",
    lastRun: overrides.lastRun ?? null,
    tab:
      tabState === null
        ? null
        : {
            id: 42,
            title: "Research source",
            url: "https://example.com/leads",
            origin: tabState === "blocked" ? null : "https://example.com",
            state: tabState,
          },
  }
}

describe("side panel status presentation", () => {
  test("prioritizes missing configuration over tab state", () => {
    const presentation = presentStatus(
      status("approval-required", { configReady: false }),
    )

    expect(presentation.title).toBe("Pair Ledry to begin")
    expect(presentation.canApprove).toBeFalse()
    expect(presentation.bridgeActivity).toBe("blocked")
  })

  test("allows tab approval while the local bridge is offline", () => {
    const presentation = presentStatus(
      status("approval-required", { bridgeConnected: false }),
    )

    expect(presentation.title).toBe("Start the local bridge")
    expect(presentation.canApprove).toBeTrue()
    expect(presentation.bridgeActivity).toBe("active")
    expect(presentation.approvalActivity).toBe("active")
  })

  test("asks for a public source when no active tab is available", () => {
    const presentation = presentStatus(status(null))

    expect(presentation.title).toBe("Open a research source")
    expect(presentation.canApprove).toBeFalse()
    expect(presentation.approvalActivity).toBe("active")
  })

  test("blocks unsupported pages", () => {
    const presentation = presentStatus(status("blocked"))

    expect(presentation.title).toBe("This page is outside Ledry's scope")
    expect(presentation.canApprove).toBeFalse()
    expect(presentation.approvalActivity).toBe("blocked")
  })

  test("exposes an explicit approval action for an eligible tab", () => {
    const presentation = presentStatus(status("approval-required"))

    expect(presentation.approvalLabel).toBe("Approve this tab")
    expect(presentation.canApprove).toBeTrue()
    expect(presentation.researchActivity).toBe("pending")
  })

  test("marks all prerequisites complete for an approved tab", () => {
    const presentation = presentStatus(status("approved"))

    expect(presentation.title).toBe("Ready to research")
    expect(presentation.canApprove).toBeFalse()
    expect(presentation.bridgeActivity).toBe("complete")
    expect(presentation.approvalActivity).toBe("complete")
    expect(presentation.researchActivity).toBe("active")
  })

  test("marks lead capture complete after a durable run", () => {
    const run = {
      id: "run:test",
      brief: "Coffee roasters",
      tabId: 42,
      requestedSource: "auto",
      actualSources: ["website"],
      limit: 5,
      discovered: 1,
      saved: 1,
      quarantined: 0,
      skipped: 0,
      status: "completed",
      warnings: [],
      startedAt: "2026-07-15T00:00:00.000Z",
      completedAt: "2026-07-15T00:00:01.000Z",
      recordIds: ["lead:1"],
    } satisfies ResearchRun
    const presentation = presentStatus(status("approved", { lastRun: run }))

    expect(presentation.title).toBe("Research saved")
    expect(presentation.researchActivity).toBe("complete")
  })
})
