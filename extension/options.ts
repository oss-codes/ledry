export {}

const form = document.querySelector<HTMLFormElement>("#settings")
const portInput = document.querySelector<HTMLInputElement>("#port")
const tokenInput = document.querySelector<HTMLInputElement>("#token")
const statusElement = document.querySelector<HTMLSpanElement>("#status")

if (
  form === null ||
  portInput === null ||
  tokenInput === null ||
  statusElement === null
) {
  throw new Error("Options page is missing required controls")
}

const saved = await chrome.storage.local.get(["port", "token"])
if (typeof saved["port"] === "number") portInput.value = String(saved["port"])
if (typeof saved["token"] === "string") tokenInput.value = saved["token"]

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
