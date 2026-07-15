import type { SidepanelStatus } from "./sidepanel-messages"

export type ActivityState = "pending" | "active" | "complete" | "blocked"

export type SidepanelPresentation = {
  readonly title: string
  readonly description: string
  readonly approvalLabel: string
  readonly canApprove: boolean
  readonly bridgeActivity: ActivityState
  readonly approvalActivity: ActivityState
  readonly researchActivity: ActivityState
}

export function presentStatus(status: SidepanelStatus): SidepanelPresentation {
  if (!status.configReady)
    return {
      title: "Pair Ledry to begin",
      description:
        "Add the local port and pairing token in settings before connecting an agent.",
      approvalLabel: "Open settings",
      canApprove: false,
      bridgeActivity: "blocked",
      approvalActivity: "pending",
      researchActivity: "pending",
    }

  if (!status.bridgeConnected)
    return {
      title: "Start the local bridge",
      description:
        "Run ledry dashboard or ledry serve, then this panel will reconnect automatically.",
      approvalLabel: "Approve tab",
      canApprove: status.tab?.state === "approval-required",
      bridgeActivity: "active",
      approvalActivity:
        status.tab?.state === "approved"
          ? "complete"
          : status.tab?.state === "blocked"
            ? "blocked"
            : status.tab?.state === "approval-required"
              ? "active"
              : "pending",
      researchActivity: "pending",
    }

  if (status.tab === null)
    return {
      title: "Open a research source",
      description:
        "Click the Ledry toolbar icon, choose a public Maps or website tab, and allow it.",
      approvalLabel: "Approve tab",
      canApprove: false,
      bridgeActivity: "complete",
      approvalActivity: "active",
      researchActivity: "pending",
    }

  switch (status.tab.state) {
    case "blocked":
      return {
        title: "This page is outside Ledry's scope",
        description:
          "Use a public business page. Personal profiles, account pages, messages, and privileged browser pages stay blocked.",
        approvalLabel: "Unavailable",
        canApprove: false,
        bridgeActivity: "complete",
        approvalActivity: "blocked",
        researchActivity: "pending",
      }
    case "approval-required":
      return {
        title: "Approve this research tab",
        description:
          "Ledry only reads and controls origins you approve from this panel.",
        approvalLabel: "Approve this tab",
        canApprove: true,
        bridgeActivity: "complete",
        approvalActivity: "active",
        researchActivity: "pending",
      }
    case "approved":
      return {
        title: status.lastRun === null ? "Ready to research" : "Research saved",
        description:
          "Your connected agent can now navigate, scroll, and capture leads from this approved origin.",
        approvalLabel: "Approved",
        canApprove: false,
        bridgeActivity: "complete",
        approvalActivity: "complete",
        researchActivity: status.lastRun === null ? "active" : "complete",
      }
    default:
      return status.tab.state satisfies never
  }
}
