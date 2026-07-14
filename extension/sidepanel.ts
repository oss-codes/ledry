import "./sidepanel.css"
import type { SidepanelRequest, SidepanelStatus } from "./sidepanel-messages"
import { createSidepanelTransport } from "./sidepanel-transport"
import { type BusyOperation, createSidepanelView } from "./sidepanel-view"

const params = new URLSearchParams(window.location.search)
const previewState = params.has("preview")
  ? (params.get("state") ?? "approved")
  : null
const transport = createSidepanelTransport(previewState)
const view = createSidepanelView()
let currentStatus: SidepanelStatus | undefined
let operationPending = false

async function request(
  message: SidepanelRequest,
  successMessage?: string,
  operation: Exclude<BusyOperation, "approval" | null> = "settings",
): Promise<void> {
  operationPending = true
  view.setBusy(operation)
  try {
    const status = await transport.request(message)
    render(status)
    if (successMessage !== undefined) view.notify(successMessage)
  } catch (error) {
    if (!(error instanceof Error)) throw error
    view.notify(error.message, "error")
  } finally {
    operationPending = false
    view.setBusy(null)
  }
}

function render(status: SidepanelStatus): void {
  currentStatus = status
  view.render(status)
}

try {
  const status = await transport.request({ type: "sidepanel.status" })
  currentStatus = status
  view.hydrate(status)
} catch (error) {
  if (!(error instanceof Error)) throw error
  view.notify(error.message, "error")
}

async function approveTab(): Promise<void> {
  const tab = currentStatus?.tab
  if (tab === undefined || tab === null || tab.origin === null) {
    view.notify("This tab cannot be approved", "error")
    return
  }
  operationPending = true
  view.setBusy("approval")
  try {
    render(await transport.approveTab(tab.id, tab.origin))
    view.focusWorkspaceTitle()
    view.notify("Tab approved for Ledry")
  } catch (error) {
    if (!(error instanceof Error)) throw error
    view.notify(error.message, "error")
  } finally {
    operationPending = false
    view.setBusy(null)
  }
}

view.approval.addEventListener("click", () => {
  void approveTab()
})

view.configure.addEventListener("click", () => {
  void request({ type: "sidepanel.options.open" }, undefined, "settings")
})

view.form.addEventListener("submit", (event) => {
  event.preventDefault()
  const brief = view.brief.value.trim()
  if (brief.length === 0) {
    view.notify("Enter a research brief before saving", "error")
    view.brief.focus()
    return
  }
  void request(
    {
      type: "sidepanel.brief.save",
      brief,
    },
    "Research brief saved locally",
    "save",
  )
})

view.brief.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return
  event.preventDefault()
  view.form.requestSubmit()
})

view.dashboard.addEventListener("click", () => {
  void request({ type: "sidepanel.dashboard.open" }, undefined, "dashboard")
})

view.settings.addEventListener("click", () => {
  void request({ type: "sidepanel.options.open" }, undefined, "settings")
})

if (previewState === null) {
  async function poll(): Promise<void> {
    if (!operationPending)
      try {
        render(await transport.request({ type: "sidepanel.status" }))
      } catch (error) {
        if (!(error instanceof Error)) throw error
        view.notify(error.message, "error")
      }
    window.setTimeout(() => void poll(), 2_000)
  }
  window.setTimeout(() => void poll(), 2_000)
}
