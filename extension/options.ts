import { isAllowedUrl } from "./policy"

const form = document.querySelector<HTMLFormElement>("#settings")
const portInput = document.querySelector<HTMLInputElement>("#port")
const tokenInput = document.querySelector<HTMLInputElement>("#token")
const statusElement = document.querySelector<HTMLSpanElement>("#status")
const tabsSelect = document.querySelector<HTMLSelectElement>("#tabs")
const approveButton = document.querySelector<HTMLButtonElement>("#approve")
const approvalStatus =
  document.querySelector<HTMLSpanElement>("#approval-status")

if (
  form === null ||
  portInput === null ||
  tokenInput === null ||
  statusElement === null ||
  tabsSelect === null ||
  approveButton === null ||
  approvalStatus === null
) {
  throw new Error("Options page is missing required controls")
}

const saved = await chrome.storage.local.get(["port", "token"])
if (typeof saved["port"] === "number") portInput.value = String(saved["port"])
if (typeof saved["token"] === "string") tokenInput.value = saved["token"]

const availableTabs = await chrome.tabs.query({})
for (const tab of availableTabs) {
  if (tab.id === undefined || tab.url === undefined || !isAllowedUrl(tab.url))
    continue
  const option = document.createElement("option")
  option.value = String(tab.id)
  option.textContent = tab.title ?? tab.url
  tabsSelect.append(option)
}

form.addEventListener("submit", (event) => {
  event.preventDefault()
  const port = Number(portInput.value)
  const token = tokenInput.value.trim()
  if (
    !Number.isInteger(port) ||
    port < 1024 ||
    port > 65535 ||
    token.length < 16
  )
    return
  void chrome.storage.local.set({ port, token }).then(() => {
    statusElement.textContent = "Saved"
  })
})

approveButton.addEventListener("click", () => {
  const tabId = Number(tabsSelect.value)
  if (!Number.isInteger(tabId)) return
  void chrome.tabs.get(tabId).then(async (tab) => {
    if (tab.url === undefined || !isAllowedUrl(tab.url)) {
      approvalStatus.textContent = "Source not allowed"
      return
    }
    const origin = new URL(tab.url).origin
    if (!(await chrome.permissions.request({ origins: [`${origin}/*`] }))) {
      approvalStatus.textContent = "Permission declined"
      return
    }
    const stored = await chrome.storage.session.get("approvedTabs")
    const raw: unknown = stored["approvedTabs"]
    const current = Array.isArray(raw)
      ? raw.flatMap((item: unknown) => {
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
      : []
    await chrome.storage.session.set({
      approvedTabs: [
        ...current.filter((item) => item.id !== tabId),
        { id: tabId, origin },
      ],
    })
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["dist/content-script.js"],
    })
    approvalStatus.textContent = "Approved"
  })
})
