import {
  approvedTabs,
  approveTab,
  isApprovedTab,
  selectedResearchTabId,
  selectResearchTab,
} from "./approved-tabs"
import "./popup.css"
import {
  canOpenPickerTab,
  createPickerState,
  type PickerState,
} from "./popup-state"
import { setPickerBusy, updatePickerSelection } from "./popup-view"
import { withOriginPermission } from "./sidepanel-permissions"

function requireElement<T extends Element>(
  selector: string,
  type: { new (): T },
): T {
  const value = document.querySelector(selector)
  if (!(value instanceof type))
    throw new Error(`Missing popup control: ${selector}`)
  return value
}

const list = requireElement("#tab-list", HTMLDivElement)
const notice = requireElement("#notice", HTMLDivElement)
const refresh = requireElement("#refresh-tabs", HTMLButtonElement)
const primary = requireElement("#allow-tab", HTMLButtonElement)
let state: PickerState = { tabs: [], selectedId: null }
let busy = false
let readyToOpenId: number | null = null

function setNotice(message: string, tone?: "success" | "error"): void {
  notice.textContent = message
  if (tone === undefined) delete notice.dataset["tone"]
  else notice.dataset["tone"] = tone
}

function selectedTab() {
  return state.tabs.find((tab) => tab.id === state.selectedId)
}

function syncPrimary(): void {
  const selected = selectedTab()
  primary.disabled = busy || selected === undefined
  refresh.disabled = busy
  setPickerBusy(list, busy)
  primary.textContent = busy
    ? "Working…"
    : selected?.approved
      ? readyToOpenId === selected.id
        ? "Open Ledry"
        : "Use selected tab"
      : "Allow selected tab"
}

function render(): void {
  list.replaceChildren()
  if (state.tabs.length === 0) {
    const empty = document.createElement("div")
    empty.className = "empty-tabs"
    empty.textContent =
      "No supported public tabs found. Open Google Maps or a public business website, then refresh."
    list.append(empty)
  } else {
    for (const tab of state.tabs) {
      const option = document.createElement("label")
      option.className = "tab-option"
      option.dataset["selected"] = String(tab.id === state.selectedId)

      const input = document.createElement("input")
      input.type = "radio"
      input.name = "research-tab"
      input.value = String(tab.id)
      input.checked = tab.id === state.selectedId
      input.addEventListener("change", () => {
        state = { ...state, selectedId: tab.id }
        updatePickerSelection(list, tab.id)
        syncPrimary()
      })

      const copy = document.createElement("span")
      copy.className = "tab-copy"
      const title = document.createElement("strong")
      title.textContent = tab.title
      const origin = document.createElement("small")
      origin.textContent = `${tab.source} · ${tab.origin}`
      copy.append(title, origin)

      const badge = document.createElement("span")
      badge.className = "tab-state"
      badge.dataset["approved"] = String(tab.approved)
      badge.textContent = tab.approved
        ? "Allowed"
        : tab.active
          ? "Current"
          : "Open"
      option.append(input, copy, badge)
      list.append(option)
    }
  }
  syncPrimary()
}

async function loadTabs(): Promise<void> {
  busy = true
  syncPrimary()
  try {
    const [tabs, approved, selectedId] = await Promise.all([
      chrome.tabs.query({ currentWindow: true }),
      approvedTabs(),
      selectedResearchTabId(),
    ])
    for (const tab of tabs) {
      if (tab.id === undefined || tab.url === undefined) continue
      const candidate = approved.find(
        (item) =>
          item.id === tab.id && item.origin === new URL(tab.url ?? "").origin,
      )
      if (candidate !== undefined) await isApprovedTab(tab)
    }
    state = createPickerState(tabs, await approvedTabs(), selectedId)
    readyToOpenId = canOpenPickerTab(
      state.tabs.find((tab) => tab.id === selectedId),
      selectedId,
    )
      ? selectedId
      : null
    setNotice(
      state.tabs.length === 0
        ? "Open a supported public page to continue."
        : "Choose one tab. Ledry will ask for access to that origin only.",
    )
  } catch (error) {
    setNotice(
      error instanceof Error ? error.message : "Could not read open tabs",
      "error",
    )
  } finally {
    busy = false
    render()
  }
}

async function handlePrimary(): Promise<void> {
  const tab = selectedTab()
  if (tab === undefined || busy) return
  busy = true
  syncPrimary()
  try {
    if (!tab.approved) {
      const current = await chrome.tabs.get(tab.id)
      if (
        current.url === undefined ||
        new URL(current.url).origin !== new URL(tab.url).origin
      )
        throw new Error("The selected tab changed before approval")
      await withOriginPermission(current.url, async () => {
        await approveTab(current)
      })
      await selectResearchTab(tab.id)
      await chrome.tabs.update(tab.id, { active: true })
      readyToOpenId = tab.id
      setNotice(
        `${tab.source} is allowed. Click Open Ledry to continue.`,
        "success",
      )
      const tabs = await chrome.tabs.query({ currentWindow: true })
      state = createPickerState(tabs, await approvedTabs(), tab.id)
      return
    }
    if (readyToOpenId !== tab.id) {
      await selectResearchTab(tab.id)
      await chrome.tabs.update(tab.id, { active: true })
      readyToOpenId = tab.id
      setNotice(
        "Research tab selected. Click Open Ledry to continue.",
        "success",
      )
      return
    }
    await chrome.sidePanel.open({ tabId: tab.id })
    window.close()
  } catch (error) {
    setNotice(
      error instanceof Error ? error.message : "Could not allow this tab",
      "error",
    )
    const tabs = await chrome.tabs.query({ currentWindow: true })
    state = createPickerState(
      tabs,
      await approvedTabs(),
      await selectedResearchTabId(),
    )
  } finally {
    busy = false
    render()
  }
}

refresh.addEventListener("click", () => void loadTabs())
primary.addEventListener("click", () => void handlePrimary())

await loadTabs()
