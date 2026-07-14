import type { SidepanelStatus } from "./sidepanel-messages"
import { type ActivityState, presentStatus } from "./sidepanel-state"

function element<T extends Element>(selector: string, type: { new (): T }): T {
  const found = document.querySelector(selector)
  if (!(found instanceof type)) throw new Error(`Missing element: ${selector}`)
  return found
}

export type SidepanelView = ReturnType<typeof createSidepanelView>
export type BusyOperation =
  | "approval"
  | "save"
  | "dashboard"
  | "settings"
  | null

export function createSidepanelView() {
  const connection = element("#connection-status", HTMLSpanElement)
  const context = element("#tab-context", HTMLElement)
  const tabTitle = element("#tab-title", HTMLParagraphElement)
  const tabOrigin = element("#tab-origin", HTMLParagraphElement)
  const tabBadge = element("#tab-badge", HTMLSpanElement)
  const approval = element("#approve-tab", HTMLButtonElement)
  const configure = element("#configure-ledry", HTMLButtonElement)
  const dashboard = element("#open-dashboard", HTMLButtonElement)
  const settings = element("#open-settings", HTMLButtonElement)
  const workspace = element("#workspace", HTMLElement)
  const title = element("#workspace-title", HTMLHeadingElement)
  const description = element("#workspace-description", HTMLParagraphElement)
  const briefThread = element("#brief-thread", HTMLDivElement)
  const briefSummary = element("#brief-summary", HTMLParagraphElement)
  const bridgeStep = element("#activity-bridge", HTMLLIElement)
  const bridgeLabel = element("#activity-bridge-label", HTMLSpanElement)
  const approvalStep = element("#activity-approval", HTMLLIElement)
  const approvalLabel = element("#activity-approval-label", HTMLSpanElement)
  const researchStep = element("#activity-research", HTMLLIElement)
  const researchLabel = element("#activity-research-label", HTMLSpanElement)
  const form = element("#brief-form", HTMLFormElement)
  const brief = element("#research-brief", HTMLTextAreaElement)
  const save = element("#save-brief", HTMLButtonElement)
  const toast = element("#toast", HTMLDivElement)
  let busyOperation: BusyOperation = null
  let canApprove = false
  let canSave = false
  let approvalText = "Approve this tab"
  let toastTimer: number | undefined

  function updateActivity(
    step: HTMLLIElement,
    label: HTMLSpanElement,
    state: ActivityState,
    text: string,
    name: string,
  ): void {
    step.dataset["state"] = state
    step.setAttribute("aria-label", `${name}: ${text}`)
    label.textContent = text
  }

  function applyControlState(): void {
    approval.disabled = busyOperation !== null || !canApprove
    approval.textContent =
      busyOperation === "approval" && canApprove ? "Approving…" : approvalText
    approval.setAttribute(
      "aria-busy",
      String(busyOperation === "approval" && canApprove),
    )
    configure.disabled = busyOperation !== null
    configure.textContent =
      busyOperation === "settings" ? "Opening settings…" : "Open settings"
    dashboard.disabled = busyOperation !== null
    dashboard.setAttribute(
      "aria-label",
      busyOperation === "dashboard"
        ? "Opening Ledry dashboard"
        : "Open Ledry dashboard",
    )
    dashboard.setAttribute("aria-busy", String(busyOperation === "dashboard"))
    settings.disabled = busyOperation !== null
    settings.setAttribute(
      "aria-label",
      busyOperation === "settings"
        ? "Opening extension settings"
        : "Open extension settings",
    )
    settings.setAttribute("aria-busy", String(busyOperation === "settings"))
    save.disabled = busyOperation !== null || !canSave
    save.dataset["busy"] = String(busyOperation === "save")
    save.setAttribute(
      "aria-label",
      busyOperation === "save"
        ? "Saving research brief"
        : "Save research brief",
    )
    form.setAttribute("aria-busy", String(busyOperation === "save"))
  }

  function render(status: SidepanelStatus): void {
    const presentation = presentStatus(status)
    connection.textContent = status.bridgeConnected ? "Online" : "Offline"
    connection.dataset["state"] = status.bridgeConnected ? "online" : "offline"
    context.dataset["state"] = status.tab?.state ?? "empty"
    tabTitle.textContent = status.tab?.title ?? "No active research tab"
    tabOrigin.textContent =
      status.tab?.origin ?? "Open a public website to continue"
    tabBadge.textContent =
      status.tab === null
        ? "No tab"
        : status.tab.state === "approved"
          ? "Approved"
          : status.tab.state === "blocked"
            ? "Blocked"
            : "Approval needed"
    approvalText = presentation.approvalLabel
    approval.hidden = !presentation.canApprove
    configure.hidden = status.configReady
    title.textContent = presentation.title
    description.textContent = presentation.description
    const hasBrief = status.currentBrief.length > 0
    workspace.dataset["hasBrief"] = String(hasBrief)
    briefThread.hidden = !hasBrief
    briefSummary.textContent = status.currentBrief
    updateActivity(
      bridgeStep,
      bridgeLabel,
      presentation.bridgeActivity,
      presentation.bridgeActivity === "complete"
        ? "Online"
        : presentation.bridgeActivity === "blocked"
          ? "Setup needed"
          : presentation.bridgeActivity === "active"
            ? "Waiting"
            : "Pending",
      "Local bridge",
    )
    updateActivity(
      approvalStep,
      approvalLabel,
      presentation.approvalActivity,
      presentation.approvalActivity === "complete"
        ? "Approved"
        : presentation.approvalActivity === "blocked"
          ? "Blocked"
          : presentation.approvalActivity === "active"
            ? "Approval needed"
            : "Pending",
      "Tab permission",
    )
    updateActivity(
      researchStep,
      researchLabel,
      presentation.researchActivity,
      presentation.researchActivity === "active" ? "Ready" : "Waiting",
      "Lead capture",
    )
    canApprove = presentation.canApprove
    canSave = status.configReady
    applyControlState()
  }

  function hydrate(status: SidepanelStatus): void {
    brief.value = status.currentBrief
    render(status)
  }

  function setBusy(operation: BusyOperation): void {
    busyOperation = operation
    applyControlState()
  }

  function focusWorkspaceTitle(): void {
    title.focus()
  }

  function notify(message: string, kind: "status" | "error" = "status"): void {
    toast.textContent = message
    toast.dataset["kind"] = kind
    toast.setAttribute("role", kind === "error" ? "alert" : "status")
    toast.setAttribute("aria-live", kind === "error" ? "assertive" : "polite")
    toast.hidden = false
    if (toastTimer !== undefined) window.clearTimeout(toastTimer)
    toastTimer = window.setTimeout(() => {
      toast.hidden = true
      toastTimer = undefined
    }, 4_000)
  }

  return {
    approval,
    brief,
    configure,
    dashboard,
    focusWorkspaceTitle,
    form,
    hydrate,
    notify,
    render,
    setBusy,
    settings,
  }
}
